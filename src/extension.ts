// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { create } from 'domain';
import OpenAI from 'openai';
import * as vscode from 'vscode';
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "javadoc-comment-generator" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const commands = [
		vscode.commands.registerCommand('javadoc-comment-generator.generateCommentsForFile', () => generateJavadocComments(vscode.window.activeTextEditor)),
		vscode.commands.registerCommand('javadoc-comment-generator.deleteJavaDocComments', () => deleteJavaDocComments(vscode.window.activeTextEditor))
	];

	commands.forEach((command) => context.subscriptions.push(command));
}

// This method is called when your extension is deactivated
export function deactivate() {}

/**
 * Generates Javadoc Comments
 * @param activeEditor VSCode editor used (READ: File edited)
 */
export async function generateJavadocComments(activeEditor: vscode.TextEditor | undefined, generateBlanks=false){
	let methods = await getMethods(activeEditor);
	if(methods){
		handleMethods(activeEditor, new Set(methods), generateBlanks);
	}

}
/**
 * Deletes all javadoc comments in a file
 * @param activeEditor VSCode editor used (READ: File edited)
 */
export function deleteJavaDocComments(activeEditor: vscode.TextEditor | undefined){
	if(activeEditor){
		let classText = activeEditor?.document.getText() as string;
		let matches = [... classText.matchAll(/\/\*\*(.*?)\*\/\s*/gs)].reverse();
		activeEditor?.edit(editBuilder => matches.forEach(match => editBuilder.replace(new vscode.Range(
								activeEditor?.document.positionAt(match.index) as vscode.Position, 
								activeEditor?.document.positionAt(match.index+match[0].toString().length) as vscode.Position), "")));
	}
}

/**
 * Gets list of methods as symbols
 * @param activeEditor VSCode editor used (READ: File edited)
 */
export async function getMethods(activeEditor: vscode.TextEditor | undefined): Promise<vscode.DocumentSymbol[] | undefined> {
	if(activeEditor){
		let symbols: Array<vscode.DocumentSymbol> = await vscode.commands.executeCommand(
			'vscode.executeDocumentSymbolProvider',
			activeEditor.document.uri
		);
		if(symbols){
			let methods: vscode.DocumentSymbol[] = [];
			let classNames: string[] = [];
			symbols=symbols.filter((child) => {if(classNames.includes(child.name)) {return false;} classNames.push(child.name); return [vscode.SymbolKind.Class, vscode.SymbolKind.Enum].includes(child.kind);});
			console.log(classNames);
			symbols.forEach((symbol) => {classNames.push(symbol.name); addMethodsToArray(methods, symbol);});
			methods.reverse();
			return methods;
		}
		else {
			vscode.window.showInformationMessage("Wait for a few more seconds!");
		}
	}
}
/**
 * Recursively adds methods to the total array of methods.
 * @param methods List of methods being added to
 * @param symbol Current symbol examined(class or enum)
 */
export async function addMethodsToArray(methods: vscode.DocumentSymbol[], symbol: vscode.DocumentSymbol){
	symbol.children.filter((child) => [vscode.SymbolKind.Function, vscode.SymbolKind.Method, vscode.SymbolKind.Constructor].includes(child.kind)).forEach((method) => methods.push(method));
	symbol.children.filter((child) => [vscode.SymbolKind.Class, vscode.SymbolKind.Enum].includes(child.kind)).forEach((child) => addMethodsToArray(methods, child));
}
/**
 * For each method, generates and inserts a javadoc string. Iterates in reverse order to prevent messing up of ranges.
 * @param activeEditor VSCode editor used (READ: File edited)
 * @param methods List of different method symbols
 */
export async function handleMethods(activeEditor: vscode.TextEditor | undefined, methods: Set<vscode.DocumentSymbol>, generateBlanks: boolean){
	console.log(vscode.workspace.getConfiguration().get("javadoc-comment-generator.includeOverridingMethods"));
	for(let method of methods){
		if(!activeEditor?.document?.getText(method.range).includes("/**") && !(vscode.workspace.getConfiguration().get("javadoc-comment-generator.includeOverridingMethods")==="true" && activeEditor?.document?.getText(method.range).includes("@Override")) && !(vscode.workspace.getConfiguration().get("javadoc-comment-generator.generateCommentsForMainMethod")==="true" && /public +static +void +main\(String(\[\])? *args(\[\])??\)/g.test(activeEditor?.document?.getText(method.range) as string))){
			console.log(method);
			let indent=activeEditor?.document?.getText(new vscode.Range(method.range.start.with({character: 0}), method.range.start)).replace(/[^\s]/g, "");
			let params: string[] | undefined = [];
			let returnVar = !(method.detail.includes("void") || method.kind===vscode.SymbolKind.Constructor);
			let override = (activeEditor?.document?.getText(method.range).includes("@Deprecated"));
			if(!method.name.includes("()")){ //This is so janky
				let identifier = method.name;
				identifier=identifier.substring(0, ((identifier.indexOf(",")!==-1)? identifier.indexOf(",") : identifier.indexOf(")")));
				let methodText=activeEditor?.document?.getText(method.range);
				let paramString=methodText?.substring(methodText.indexOf(identifier));
				paramString=paramString?.substring(paramString.indexOf("(")+1, paramString.indexOf(")")); 
				params=paramString?.replace(/[^(,]*<+(.*?)>+ | *[A-z0-9.]+ +/g, "").split(","); //I made that beautiful regex
			}
			let methodDoc;
			if(generateBlanks){
				let blankParamDict: {[id:string]: string} = {};
				for(let param of params as string[]){
					blankParamDict[param] = "";
				}
				methodDoc = createJavaDocString("", blankParamDict, (returnVar)? "": undefined, (override)? "": undefined, indent as string);
				
			}
			else{
				let methodProperties = await promptUser(method.name, params, returnVar, override);
				methodDoc = createJavaDocString(methodProperties[0] as string, methodProperties[1] as {[id:string]: string}, methodProperties[2] as string, methodProperties[3] as string, indent as string);
			}
			activeEditor?.edit((editBuilder) => editBuilder.insert(method.range.start, methodDoc));
		};
	}
}
/**
 * Prompts user for descriptions
 * @param methodName Name of method
 * @param params List of params
 * @param returnVar Boolean that if true, indicates that the method returns a value
 * @param override Boolean that if true, indicates that the method returns a value
 * @returns Array of descriptions
 */
export async function promptUser(methodName:string, params: string[] | undefined, returnVar:boolean, override:boolean | undefined): Promise<({ [id: string]: string; } | string | undefined)[]>{
	let o=[];
	let methodDesc = await vscode.window.showInputBox({
		prompt: "Description of the method: " + methodName,
		title: "Description of the method: " + methodName
	});
	if(!methodDesc) {methodDesc="";}
	o.push(methodDesc);
	let paramDict:{[id:string]: string}={};
	if(params){
		for(let param of params){let desc = await vscode.window.showInputBox({
					prompt: "Description for the parameter: " + param + " of method: " + methodName,
					title: "Description for the parameter: " + param + " of method: " + methodName
				}); 
			if(!desc) {desc="";}
			paramDict[param] = desc;
		}
	}
	o.push(paramDict);
	if(returnVar){
		let desc = await vscode.window.showInputBox({
				prompt: "Description for the return of method: " + methodName,
				title: "Description for the return of method: " + methodName
		}); 
		if(!desc) {desc="";}
		o.push(desc);
	}
	else{
		o.push(undefined);
	}
	if(override){
		let desc = await vscode.window.showInputBox({
				prompt: "What is the path of the alternative method of method: " + methodName,
				title: "What is the path of the alternative method? of method: " + methodName
		}); 
		if(!desc) {desc="";}
		o.push(desc);
	}
	else{
		o.push(undefined);
	}
	return o;
}

/**
 * Creates an output javadoc String
 * @param description Description of the javadoc method
 * @param parameters Dictionary of name and descriptions of the parameters
 * @param returnVar If undefined no return variable, else it is the description of the return 
 * @param deprecated If undefined not deprecated, else it links to the alternate method to use.
 * @returns Formatted Javadoc String
 */
export function createJavaDocString(description:string, parameters:{[id:string]: string}, returnVar: string | undefined, deprecated: string | undefined, indent: string): string{
	console.log("Generating Javadoc String");
	let o="/**";
	let splitDescription = [];
	do {
		splitDescription.push(description.substring(0, Math.min(description.length, 120)));
		description=description.substring(Math.min(description.length, 120));
	} while (description.length>0);
	splitDescription.forEach((descriptionSection) => o+="\n"+indent+" * "+descriptionSection);
	Object.entries(parameters).forEach(
		([name, desc]) => o+=`\n${indent} * @param ${name} ${desc}`
	);
	if(returnVar!==undefined) {o+=`\n${indent} * @return ${returnVar}`;}
	if(deprecated!==undefined) {o+=`\n${indent} * @deprecated Use {@link ${deprecated}} instead`;}

	o+="\n"+indent+" */\n"+indent;
	return o;
}

// export async function getClassVariables(params:type) {
	
// }
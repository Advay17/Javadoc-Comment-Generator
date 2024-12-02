// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
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
	const disposable = vscode.commands.registerCommand('javadoc-comment-generator.helloWorld', () => {getMethods(vscode.window.activeTextEditor);});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
/**
 * Gets list of methods as symbols
 * @param activeEditor VSCode editor used (READ: File edited)
 */
export async function getMethods(activeEditor: vscode.TextEditor | undefined) {
	if(activeEditor){
		let symbols: Array<vscode.DocumentSymbol> | undefined = await vscode.commands.executeCommand(
			'vscode.executeDocumentSymbolProvider',
			activeEditor.document.uri
		);
		if(symbols){
			let methods: vscode.DocumentSymbol[] = [];
			symbols.forEach((symbol) => addMethodsToArray(methods, symbol));
			console.log(methods);
			methods.reverse();
			handleMethods(activeEditor, methods);
			console.log("done");
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
export async function handleMethods(activeEditor: vscode.TextEditor | undefined, methods: Array<vscode.DocumentSymbol>){
	methods.forEach((method) => {
		if(!activeEditor?.document?.getText(method.range).includes("/**")){
			let params = [];
			let returnVar = !(method.detail.includes("void") || method.kind===vscode.SymbolKind.Constructor);
			let override = (activeEditor?.document?.getText(method.range).includes("@Override"));
			if(!method.name.includes("()")){ //This is so janky
				let identifier = method.name;
				identifier=identifier.substring(0, ((identifier.indexOf(",")!==-1)? identifier.indexOf(",") : identifier.indexOf(")")));
				console.log(identifier);
			}
			// console.log(activeEditor?.document?.getText(method.range));
		}});
}

/**
 * Creates an output javadoc String
 * @param description Description of the javadoc method
 * @param parameters Dictionary of name and descriptions of the parameters
 * @param returnVar If undefined no return variable, else it is the description of the return 
 * @param deprecated If undefined not deprecated, else it links to the alternate method to use.
 * @returns Formatted Javadoc String
 */
export function createJavaDocString(description:string, parameters:{string: string}, returnVar: string | undefined, deprecated: string | undefined): String{
	let o="/**";
	let splitDescription = [];
	while(description.length>0){
		splitDescription.push(description.substring(0, Math.min(description.length, 120)));
		description=description.substring(Math.min(description.length, 120));
	}
	splitDescription.forEach((descriptionSection) => o+="\n * "+descriptionSection);
	Object.entries(parameters).forEach(
		([name, desc]) => o+=`\n * @param ${name} ${desc}`
	);
	if(returnVar) {o+=`\n * @return ${returnVar}`;}
	if(deprecated) {o+=`\n * @deprecated Use {@link ${deprecated}} instead`;}

	o+="\n */";
	return "";
}

// export async function getClassVariables(params:type) {
	
// }
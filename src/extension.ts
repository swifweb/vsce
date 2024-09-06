import { ExtensionContext, OpenDialogOptions, TreeView, Uri, ViewColumn, WebviewPanel, WebviewView, commands, env, window, workspace } from 'vscode'
import { WebberState } from './enums/WebberStateEnum'
import * as fs from 'fs'
import { selectFolder } from './helpers/selectFolderHelper'
import { startNewProjectWizard } from './wizards/startNewProjectWizard'
import { Dependency, DepNodeProvider } from './depNodeProvider'
import { Webber } from './webber'

export let extensionContext: ExtensionContext
export let projectDirectory: string | undefined
let webber: Webber | undefined
let depNodeProvider: DepNodeProvider | undefined
 
function isContainer(): boolean {
	return env.remoteName?.includes('container') == true
}

export async function activate(context: ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "swifweb" is now active!')

	// vscode.window.createTreeView("", )
	
	// Open folder name
	let folderName = workspace.name

	// Store pointer to extension context
	extensionContext = context
	
	// Monitoring project directory path
	projectDirectory = (workspace.workspaceFolders && (workspace.workspaceFolders.length > 0))
		? workspace.workspaceFolders[0].uri.fsPath : undefined
	workspace.onDidChangeWorkspaceFolders(event => {
		window.showInformationMessage('onDidChangeWorkspaceFolders')
		console.log('onDidChangeWorkspaceFolders')
		for (const added of event.added) {
			console.dir(added)
		}
	})

	registerCommands()

	////

	

	////

	if (!projectDirectory) {
		commands.executeCommand('setContext', 'webber.state', WebberState.NoProjectFolder)
		return
	}

	if (!fs.existsSync(`${projectDirectory}/Package.swift`)) {
		commands.executeCommand('setContext', 'webber.state', WebberState.EmptyProjectFolder)
		return
	}

	if (projectDirectory) {
		window.showInformationMessage(`workspace.name: ${(await workspace.findFiles('*.swift')).map((f) => f.path).join('/')}`)
		await switchToProjectMode()


	}
}

function registerCommands() {
	extensionContext.subscriptions.push(commands.registerCommand('startNewProjectWizard', startNewProjectWizard))
	commands.registerCommand('openProject', openProject)
	// commands.registerCommand('generateProject', generateProject)
	// commands.registerCommand('regenerateProject', generateProject)
	// commands.registerCommand('buildApp', buildApp)
	// commands.registerCommand('installApp', installApp)
	// commands.registerCommand('runApp', runApp)
}

async function openProject() {
	const folderUri = await selectFolder('Please select folder with a project', 'Open')
	commands.executeCommand('remote-containers.openFolder', folderUri)
	commands.executeCommand('remote-containers.revealLogTerminal')
}

async function switchToProjectMode() {
	commands.executeCommand('setContext', 'webber.state', WebberState.ProjectMode)
	if (projectDirectory) {
		webber = new Webber(projectDirectory)
		// await webber.prepare(undefined)
	}
	depNodeProvider = new DepNodeProvider(projectDirectory, webber)
	let tv: TreeView<Dependency> = window.createTreeView('webberSidebar', {
		treeDataProvider: depNodeProvider
	})
}

/**
 * Shows a pick list using window.showQuickPick().
 */
export async function showQuickPick() {
	let i = 0
	const result = await window.showQuickPick(['one', 'two', 'three'], {
		placeHolder: 'one, two or three',
		onDidSelectItem: item => window.showInformationMessage(`Focus ${++i}: ${item}`)
	})
	window.showInformationMessage(`Got: ${result}`)
}

/**
 * Shows an input box using window.showInputBox().
 */
export async function showInputBox() {
	const result = await window.showInputBox({
		value: 'abcdef',
		valueSelection: [2, 4],
		placeHolder: 'For example: fedcba. But not: 123',
		validateInput: text => {
			window.showInformationMessage(`Validating: ${text}`)
			return text === '123' ? 'Not 123!' : null
		}
	})
	window.showInformationMessage(`Got: ${result}`)
}

export function deactivate() {}
import * as fs from 'fs'
import * as os from 'os'
import { commands, extensions, Uri, ViewColumn, WebviewPanel, window } from 'vscode'
import { selectFolder } from '../helpers/selectFolderHelper'
import { defaultServerPort, defaultWebDevPort, defaultWebProdPort, extensionContext } from '../extension'
import { sortLibraryFilePaths } from '../helpers/sortLibraryFilePaths'
import { checkPortAndGetNextIfBusy } from '../helpers/checkPortAndGetNextIfBusy'
import { webSourcesFolder } from '../webber'
import { FileBuilder } from '../helpers/fileBuilder'
import Handlebars from 'handlebars'
import { copyFile, readFile } from '../helpers/filesHelper'

let webViewPanel: WebviewPanel | undefined

export async function startNewProjectWizard() {
	if (webViewPanel) { return }
	webViewPanel = window.createWebviewPanel(
		'swiftstream',
		'Swift Stream',
		ViewColumn.One,
		{// Enable scripts in the webview
			enableScripts: true
		}
	)
	webViewPanel.onDidDispose(() => {
		webViewPanel = undefined
	})
	webViewPanel.onDidChangeViewState((e) => {
		console.dir(e)
	})
	webViewPanel.iconPath = Uri.file(extensionContext.extensionPath + '/media/favicon.ico')
	const htmlPath = Uri.file(extensionContext.extensionPath + '/media/startNewProject.html')
	const basePath: string = webViewPanel.webview.asWebviewUri(Uri.file(extensionContext.extensionPath + '/media')).toString()
	webViewPanel.webview.html = fs.readFileSync(htmlPath.fsPath, 'utf8')
		.replaceAll('__LF__', basePath)
	webViewPanel?.webview.onDidReceiveMessage(async (event) => {
		switch (event.command) {
			case 'createNewProject':
				await createNewProjectFiles(
					event.payload.name,
					event.payload.path,
					event.payload.selectedValues,
					event.payload.libraryFiles
				)
				break
			case 'openNewProject':
				commands.executeCommand(`vscode.openFolder`, Uri.parse(event.payload.path))
				break
			case 'getUserHomePath':
				webViewPanel?.webview.postMessage({ type: 'userHomePath', data: { path: os.homedir() } })
				break
			case 'selectFolder':
				const folderPath = (await selectFolder('Please select a folder for the project', 'Select'))?.path
				if (folderPath) {
					webViewPanel?.webview.postMessage({ type: event.payload.type, data: { path: folderPath } })
				}
				break
		}
	})
	webViewPanel?.reveal()
}

async function createNewProjectFiles(
	name: string,
    path: string,
	selectedValues: any,
	libraryFiles: string[]
) {
	function capitalizeFirstLetter(string: string) {
		return string[0].toUpperCase() + string.slice(1);
	}
	name = capitalizeFirstLetter(name)
	var pathWasExists = true
	try {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path)
			pathWasExists = false
		}
		if (fs.existsSync(`${path}/Package.swift`)) {
			const rewriteContent = await window.showWarningMessage(
				`
				Folder already contains Package.swift.
				Would you like to overwrite it?
				`,
				'Rewrite',
				'Cancel'
			)
			if (rewriteContent != 'Rewrite') {
				webViewPanel?.webview.postMessage({ type: 'creatingFailed', data: {} })
				return
			}
		}
		if (!fs.existsSync(`${path}/.devcontainer`)) {
			fs.mkdirSync(`${path}/.devcontainer`)
		}
		const devContainerPath = `${path}/.devcontainer/devcontainer.json`
		const streamType = selectedValues['stream']
		const copyDevContainerFile = async (from: string, to?: string) => {
			await copyFile(`assets/Devcontainer/${streamType}/${from}`, `${path}/.devcontainer/${to ?? from}`)
		}
		const copySourceFile = async (from: string, to?: string) => {
			await copyFile(`assets/Sources/${streamType}/${from}`, `${path}/${to ?? from}`)
		}
		// MARK: TARGETS
		const buildTarget = (type: string, name: string, options: { dependencies?: string[], resources?: string[], plugins?: string[] }) => {
			var items: string[] = []
			items.push(`name: "${name}"`)
			function arrayItems(name: string, items: string[]): string {
				return `${name}: [\n                ${items.join(',\n                ')}\n            ]`
			}
			if (options.dependencies && options.dependencies.length > 0) {
				items.push(arrayItems('dependencies', options.dependencies))
			}
			if (options.resources && options.resources.length > 0) {
				items.push(arrayItems('resources', options.resources))
			}
			if (options.plugins && options.plugins.length > 0) {
				items.push(arrayItems('plugins', options.plugins))
			}
			return `.${type}(\n            ${items.join(',\n            ')}\n        )`
		}
		var targets: string[] = []
		var platforms: string[] = []
		var products: string[] = []
		var dependencies: string[] = []
		function createPackageManifest() {
			// MARK: PACKAGE
			var packageItems: string[] = []
			packageItems.push(`name: "${name}"`)
			function packageArrayItems(name: string, items: string[]): string {
				return `${name}: [\n        ${items.join(',\n        ')}\n    ]`
			}
			parseStructuredLibraryFiles(LibraryFileType.js)
			parseStructuredLibraryFiles(LibraryFileType.css)
			parseStructuredLibraryFiles(LibraryFileType.fonts)
			const libResources: string[] = libResourcesArray.length > 0 ? libResourcesArray : ['// .copy("css/bootstrap.css")', '// .copy("css")']
			targets.push(buildTarget('target', name, {
				dependencies: [
					'.product(name: "Web", package: "web")'
				], resources: libResources
			}))
		} else {
			targets.push(buildTarget('executableTarget', 'App', {
				dependencies: [
					'.product(name: "Web", package: "web")'
				], resources: (type == 'spa') ? ['.copy("favicon.ico")'] : []
			}))
			if (type != 'spa') {
				targets.push(buildTarget('executableTarget', 'Service', {
					dependencies: [
						'.product(name: "ServiceWorker", package: "web")'
					], resources: [
						'.copy("images/favicon.ico")',
						'.copy("images/icon-192.png")',
						'.copy("images/icon-512.png")',
						'.copy("images")'
					]
				}))
			}
		}
		// MARK: PACKAGE
		var packageItems: string[] = []
		packageItems.push(`name: "${name}"`)
		function packageArrayItems(name: string, items: string[]): string {
			return `${name}: [\n        ${items.join(',\n        ')}\n    ]`
		}
		if (platforms.length > 0) {
			packageItems.push(packageArrayItems('platforms', platforms))
		}
		if (products.length > 0) {
			packageItems.push(packageArrayItems('products', products))
		}
		if (dependencies.length > 0) {
			packageItems.push(packageArrayItems('dependencies', dependencies))
		}
		if (targets.length > 0) {
			packageItems.push(packageArrayItems('targets', targets))
		}
		var packageSwift = `// swift-tools-version: 5.10`
		packageSwift += `\nimport PackageDescription`
		packageSwift += `\n`
		packageSwift += `\nlet package = Package(`
		packageSwift += `\n    ${packageItems.join(',\n    ')}`
		packageSwift += `\n)`
		fs.writeFileSync(`${path}/Package.swift`, packageSwift)
		if (type == 'lib') {
			//MARK: MAIN LIB FILE
			var mainFile = `import Web`
			mainFile += `\n`
			mainFile += `\npublic class ${name} {`
			if (sortedLibraryFilePaths.css.length > 0) {
				mainFile += `\n    public static func configure(avoidStyles: Bool? = nil) {`
				mainFile += `\n        if avoidStyles != true {`
				const paths = sortedLibraryFilePaths.css.map((path) => {
					const pathComponents = path.split('/')
					return pathComponents[pathComponents.length - 1]
				})
				mainFile += `\n            let files: [String] = [${paths.map(x => `"${x}"`).join(', ')}]`
				mainFile += `\n            for file in files {`
				mainFile += `\n                let link = Link().rel(.stylesheet).href("/css/\\(file)")`
				mainFile += `\n                WebApp.shared.document.head.appendChild(link)`
				mainFile += `\n            }`
				mainFile += `\n        }`
			} else {
				mainFile += `\n    public static func configure() {`
			}
			if (sortedLibraryFilePaths.fonts.length > 0) {
				const fonts = sortedLibraryFilePaths.fonts.map((path) => {
					const pathComponents = path.split('/')
					return pathComponents[pathComponents.length - 1]
				})
				mainFile += `\n        let fonts: [String] = [${fonts.map(x => `"${x}"`).join(', ')}]`
				mainFile += `\n        WebApp.shared.document.head.appendChild(Style {`
				mainFile += `\n            ForEach(fonts) { font in`
				mainFile += `\n                CSSRule(Pointer(stringLiteral: "@font-face"))`
				mainFile += `\n                    .fontFamily(.familyName(font.components(separatedBy: ".")[0].replacingOccurrences(of: ".", with: "")))`
				mainFile += `\n                    .property(.init("src"), "/fonts/\\(font)")`
				mainFile += `\n            }`
				mainFile += `\n        })`
			}
			if (sortedLibraryFilePaths.js.length > 0) {
				const paths = sortedLibraryFilePaths.js.map((path) => {
					const pathComponents = path.split('/')
					return pathComponents[pathComponents.length - 1]
				})
				mainFile += `\n        let files: [String] = [${paths.map(x => `"${x}"`).join(', ')}]`
				mainFile += `\n        for file in files {`
				mainFile += `\n            let script = Script().src("/js/\\(file)")`
				mainFile += `\n            WebApp.shared.document.head.appendChild(script)`
				mainFile += `\n        }`
				mainFile += `\n    }`
				mainFile += `\n}`
			}
			const p = `${path}/Sources/${name}`
			if (!fs.existsSync(p)) {
				fs.mkdirSync(p, { recursive: true })
			}
			fs.writeFileSync(`${p}/${name}.swift`, mainFile)
		} else if (['spa', 'pwa'].includes(type)) {
			//MARK: MAIN APP FILE
			var mainFile = `import Web`
			mainFile += `\n`
			mainFile += `\n@main`
			mainFile += `\nclass App: WebApp {`
			mainFile += `\n    @AppBuilder override var app: Configuration {`
			mainFile += `\n        Lifecycle.didFinishLaunching { app in`
			if (type == 'pwa') {
				mainFile += `\n            Navigator.shared.serviceWorker?.register("./service.js")`
			}
			mainFile += `\n            print("Lifecycle.didFinishLaunching")`
			mainFile += `\n        }.willTerminate {`
			mainFile += `\n            print("Lifecycle.willTerminate")`
			mainFile += `\n        }.willResignActive {`
			mainFile += `\n            print("Lifecycle.willResignActive")`
			mainFile += `\n        }.didBecomeActive {`
			mainFile += `\n            print("Lifecycle.didBecomeActive")`
			mainFile += `\n        }.didEnterBackground {`
			mainFile += `\n            print("Lifecycle.didEnterBackground")`
			mainFile += `\n        }.willEnterForeground {`
			mainFile += `\n            print("Lifecycle.willEnterForeground")`
			mainFile += `\n        }`
			mainFile += `\n        Routes {`
			mainFile += `\n            Page { IndexPage() }`
			mainFile += `\n            Page("hello") { HelloPage() }`
			mainFile += `\n            Page("**") { NotFoundPage() }`
			mainFile += `\n        }`
			mainFile += `\n    }`
			mainFile += `\n}`
			const p = `${path}/Sources/App`
			if (!fs.existsSync(p)) {
				fs.mkdirSync(p, { recursive: true })
			}
			fs.writeFileSync(`${p}/App.swift`, mainFile)
			// IndexPage file
			var indexPage = `import Web`
			indexPage += `\n`
			indexPage += `\nclass IndexPage: PageController {`
			indexPage += `\n    @DOM override var body: DOM.Content {`
			indexPage += `\n        P("Index page")`
			indexPage += `\n    }`
			indexPage += `\n}`
			const pagesPath = `${path}/Sources/App/Pages`
			if (!fs.existsSync(pagesPath)) {
				fs.mkdirSync(pagesPath, { recursive: true })
			}
			fs.writeFileSync(`${pagesPath}/IndexPage.swift`, indexPage)
			// HelloPage file
			var helloPage = `import Web`
			helloPage += `\n`
			helloPage += `\nclass HelloPage: PageController {`
			helloPage += `\n    @DOM override var body: DOM.Content {`
			helloPage += `\n        P("HELLO page")`
			helloPage += `\n            .textAlign(.center)`
			helloPage += `\n            .body {`
			helloPage += `\n                Button("go back").display(.block).onClick {`
			helloPage += `\n                    History.back()`
			helloPage += `\n                }`
			helloPage += `\n            }`
			helloPage += `\n    }`
			helloPage += `\n}`
			helloPage += `\n`
			helloPage += `\nclass Hello_Preview: WebPreview {`
			helloPage += `\n    @Preview override class var content: Preview.Content {`
			helloPage += `\n        Language.en`
			helloPage += `\n        Title("Hello endpoint")`
			helloPage += `\n        Size(200, 200)`
			helloPage += `\n        HelloPage()`
			helloPage += `\n    }`
			helloPage += `\n}`
			fs.writeFileSync(`${path}/Sources/App/Pages/HelloPage.swift`, helloPage)
			// NotFoundPage file
			var notFoundPage = `import Web`
			notFoundPage += `\n`
			notFoundPage += `\nclass NotFoundPage: PageController {`
			notFoundPage += `\n    @DOM override var body: DOM.Content {`
			notFoundPage += `\n        P("404 NOT FOUND page")`
			notFoundPage += `\n            .textAlign(.center)`
			notFoundPage += `\n            .body {`
			notFoundPage += `\n                Button("go back").display(.block).onClick {`
			notFoundPage += `\n                    History.back()`
			notFoundPage += `\n                }`
			notFoundPage += `\n            }`
			notFoundPage += `\n    }`
			notFoundPage += `\n}`
			notFoundPage += `\n`
			notFoundPage += `\nclass NotFound_Preview: WebPreview {`
			notFoundPage += `\n    @Preview override class var content: Preview.Content {`
			notFoundPage += `\n        Language.en`
			notFoundPage += `\n        Title("Not found endpoint")`
			notFoundPage += `\n        Size(200, 200)`
			notFoundPage += `\n        NotFoundPage()`
			notFoundPage += `\n    }`
			notFoundPage += `\n}`
			fs.writeFileSync(`${path}/Sources/App/Pages/NotFoundPage.swift`, notFoundPage)
			if (type == 'pwa') {
				// Service Worker file
				var servicePage = `import ServiceWorker`
				servicePage += `\n`
				servicePage += `\n@main`
				servicePage += `\npublic class Service: ServiceWorker {`
				servicePage += `\n    @ServiceBuilder public override var body: ServiceBuilder.Content {`
				servicePage += `\n        Manifest`
				servicePage += `\n            .name("SwiftPWA")`
				servicePage += `\n            .startURL(".")`
				servicePage += `\n            .display(.standalone)`
				servicePage += `\n            .backgroundColor("#2A3443")`
				servicePage += `\n            .themeColor("white")`
				servicePage += `\n            .icons(`
				servicePage += `\n                .init(src: "images/icon-192.png", sizes: .x192, type: .png),`
				servicePage += `\n                .init(src: "images/icon-512.png", sizes: .x512, type: .png)`
				servicePage += `\n            )`
				servicePage += `\n        Lifecycle.activate {`
				servicePage += `\n            debugPrint("service activate event")`
				servicePage += `\n        }.install {`
				servicePage += `\n            debugPrint("service install event")`
				servicePage += `\n        }.fetch {`
				servicePage += `\n            debugPrint("service fetch event")`
				servicePage += `\n        }.sync {`
				servicePage += `\n            debugPrint("service sync event")`
				servicePage += `\n        }.contentDelete {`
				servicePage += `\n            debugPrint("service contentDelete event")`
				servicePage += `\n        }`
				servicePage += `\n    }`
				servicePage += `\n}`
				const p = `${path}/Sources/Service`
				if (!fs.existsSync(p)) {
					fs.mkdirSync(p, { recursive: true })
				}
				fs.writeFileSync(`${path}/Sources/Service/Service.swift`, servicePage)
			}
		}
		// MARK: PACKAGE.json
		const wSourcesPath = `${path}/${webSourcesFolder}`
		if (!fs.existsSync(wSourcesPath)) {
			fs.mkdirSync(wSourcesPath, { recursive: true })
		}
		var packageJson = {
			name: name.toLowerCase(),
			version: '1.0.0',
			devDependencies: {
				"@wasmer/wasi": "^0.12.0",
				"@wasmer/wasmfs": "^0.12.0",
				"javascript-kit-swift": "file:../.build/.wasi/checkouts/JavaScriptKit",
				"reconnecting-websocket": "^4.4.0",
				"webpack": "^5.91.0",
				"webpack-cli": "^5.1.4"
			}
		}
		fs.writeFileSync(`${wSourcesPath}/package.json`, JSON.stringify(packageJson, null, '\t'))
		// MARK: OPEN PROJECT
		if (await openProject(Uri.parse(path)) == false) {
			commands.executeCommand(`vscode.openFolder`, Uri.parse(path))
		}
	} catch (error) {
		webViewPanel?.webview.postMessage({ type: 'creatingFailed', data: {} })
		window.showErrorMessage(`Unable to create project: ${error}`)
		if (!pathWasExists) {
			try {
				fs.rmSync(path, { recursive: true })
			} catch (error) {
				window.showErrorMessage(`Unable to delete: ${error}`)
			}
		}
	}
}

async function openProject(folderUri: Uri): Promise<boolean> {
    const extension = extensions.getExtension('ms-vscode-remote.remote-containers')
    if (!extension) { return false }
	try {
		if (!extension.isActive) { await extension.activate() }
		webViewPanel?.webview.postMessage({ type: 'openingInContainer', data: {} })
		commands.executeCommand('remote-containers.openFolder', folderUri)
		commands.executeCommand('remote-containers.revealLogTerminal')
		return true
	} catch (error) {
		return false
	}
}
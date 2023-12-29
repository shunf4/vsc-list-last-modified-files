const vscode = require('vscode');
const childProcess = require('child_process');
const path = require('path');

function activate(context) {
	const getTextEditor = (document) => {
		return vscode.window.visibleTextEditors.find(editor => editor.document === document);
	};

	// vscode.Uri uses literal JSON string, instead of URLEncoded Form, to store its query param.
	const curi = vscode.Uri.from({
		scheme: "list-last-modified-files",
		path:  "listLastModifiedFiles",
		query: JSON.stringify({ title: 'Last Modified Files' }),
	});

	const cp = (() => {
		let o = {};
		o.content = '';
		o.onDidChangeEmitter = new vscode.EventEmitter();
		o.onDidChange = o.onDidChangeEmitter.event;

		o.provideTextDocumentContent = (uri, token) => {
			return o.content;
		}

		return o;
	})();

	const alreadyClickedDecor = vscode.window.createTextEditorDecorationType({
		backgroundColor: new vscode.ThemeColor('merge.currentContentBackground'),
		isWholeLine: false,
		overviewRulerColor: 'darkgreen',
		overviewRulerLane: vscode.OverviewRulerLane.Full
	});

	let clickables = [];
	let lock = false;

	const listLastModifiedFiles = (folderPathStr) => {
		const refreshDoc = async (doc, shouldForce) => {
			if (lock && !shouldForce) {
				return;
			}
			lock = true;

			const findRawResult = (await new Promise((resolve, reject) => {
				childProcess.exec(
					(() => {
						let command = vscode.workspace.getConfiguration('list-last-modified-files').get('customCommand');
						if (!command) {
							command = 'sh -c "find \"{baseDirPath}\" -type f -exec stat -c %y\\ \\ \\ \\ \\ %n {} + | sort -r | head -150 | iconv -t utf-8"';
							if (process.platform === 'win32') {
								command = 'busybox ' + command;
							}
							if (process.platform === 'darwin') {
								command = 'sh -c "find \"{baseDirPath}\" -type f -exec stat -f %Sm\\ \\ \\ \\ \\ %N -t %F\\ %T {} + | sort -r | head -150"';
							}
						}

						command = command.replace('{baseDirPath}', folderPathStr.replace(/\\/g, '/'));
						
						return command;
					})(),
					{ encoding: 'utf8', cwd: vscode.workspace.rootPath },
					(err, stdout) => {
						if (err) {
							reject(err);
						} else {
							resolve(stdout);
						}
					}
				);
			})).replaceAll('\r', '');
			
			let pendingContent = "";
			let lineI = 0;

			const initPendingContentAndAddHeader = () => {
				pendingContent = "";
				lineI = 0;
				clickables = [];
				for (let i = 0; i < 6; i++) {
					pendingContent += '\n';
					lineI++;
				}
				let currLine = '';
				currLine += ' ';
				let currString = 'Refresh';
				clickables.push({
					range: new vscode.Range(lineI, currLine.length, lineI, currLine.length + currString.length),
					isAlreadyClicked: false,
					click: function (editor) {
						this.isAlreadyClicked = true;
						setAlreadyClickedDecorations(editor);
						refreshDoc(doc, false);
					},
				});
				currLine += currString;

				currLine += '    ';
				currString = 'Force Refresh';
				clickables.push({
					range: new vscode.Range(lineI, currLine.length, lineI, currLine.length + currString.length),
					isAlreadyClicked: false,
					click: function (editor) {
						this.isAlreadyClicked = true;
						setAlreadyClickedDecorations(editor);
						refreshDoc(doc, true);
					},
				});
				currLine += currString;

				currLine += '  ';

				pendingContent += currLine;
				pendingContent += '\n';
				lineI++;
				pendingContent += '---------------------------------\n';
				lineI++;
				pendingContent += '\n';
				lineI++;
			}

			initPendingContentAndAddHeader();
			cp.content = pendingContent + "Loading...\n";
			cp.onDidChangeEmitter.fire(curi);

			initPendingContentAndAddHeader();
			for (const findRawLine of findRawResult.split('\n')) {
				if (findRawLine.trim() === '') {
					continue;
				}
				const [ modTimestamp, filePath ] = findRawLine.split('     ');
				let rangeLeft;
				let rangeRight;
				let currLine = '';

				currLine += modTimestamp;
				currLine += '     ';
				rangeLeft = currLine.length;
				currLine += filePath;
				rangeRight = currLine.length;
				currLine += '  ';

				pendingContent += currLine;
				pendingContent += '\n';
				const range = new vscode.Range(lineI, rangeLeft, lineI, rangeRight);

				clickables.push({
					range,
					isAlreadyClicked: false,
					click: function (editor) {
						this.isAlreadyClicked = true;
						setAlreadyClickedDecorations(editor);
						vscode.workspace.openTextDocument(vscode.Uri.parse(
							'file:' + path.resolve(vscode.workspace.rootPath, filePath).replace(/\\/g, '/')
						)).then(async doc2 => {
							vscode.window.showTextDocument(doc2, {
								preview: false,
								preserveFocus: true,
							});
						});
					},
				});

				lineI++;
			}

			cp.content = pendingContent;
			cp.onDidChangeEmitter.fire(curi);
			// It's possible for the event to be dropped by VSCode; fire again a moment later
			// https://github.com/microsoft/vscode/issues/179711
			// https://github.com/microsoft/vscode/pull/200149
			setTimeout(() => {
				cp.onDidChangeEmitter.fire(curi);
			}, 200);
			setTimeout(() => {
				cp.onDidChangeEmitter.fire(curi);
			}, 400);
			setTimeout(() => {
				cp.onDidChangeEmitter.fire(curi);
			}, 1000);
			lock = false;
		};

		vscode.workspace.openTextDocument(curi).then(async doc => {
			vscode.window.showTextDocument(doc, {
			  preview: false,
			  preserveFocus: true
			});
			await refreshDoc(doc, false);
		});
	}

	const d0 = vscode.commands.registerCommand('list-last-modified-files.listLastModifiedFilesRoot', () => {
		listLastModifiedFiles(".");
	});

	const d1 = vscode.commands.registerCommand('list-last-modified-files.listLastModifiedFilesFolder', (folderPath) => {
		let folderPathStr = ".";
		if (folderPath) {
			folderPathStr = path.relative(vscode.workspace.rootPath, folderPath.fsPath) || ".";
		}
		listLastModifiedFiles(folderPathStr);
	});

	const d2 = vscode.workspace.registerTextDocumentContentProvider("list-last-modified-files", cp);

	
	const d3 = vscode.window.createTextEditorDecorationType({
		cursor: 'pointer',
		textDecoration: 'underline',
		color: new vscode.ThemeColor('editorLink.activeForeground'),
	});

	const setAlreadyClickedDecorations = (editor) => {
		editor.setDecorations(
			alreadyClickedDecor,
			clickables.filter(clickable => clickable.isAlreadyClicked).map(clickable => {
				return clickable.range;
			})
		);
	};

	const setDecorations = (editor) => {
		if (!editor || editor.document.uri.scheme !== "list-last-modified-files") {
			return;
		}

		setAlreadyClickedDecorations(editor);
		editor.setDecorations(
			d3,
			clickables.map(clickable => {
				return clickable.range;
			})
		);
	};

	const d4 = [];
	vscode.window.onDidChangeActiveTextEditor(
		editor => {
		  if (editor && editor.document.uri.scheme === "list-last-modified-files") {
			setDecorations(editor);
		  }
		},
		null,
		d4,
	  );
  
	const d5 = [];
	vscode.workspace.onDidChangeTextDocument(
		e => {
		  if (e.document.uri.scheme === "list-last-modified-files") {
			setDecorations(getTextEditor(e.document));
		  }
		},
		null,
		d5,
	  );

	const d6 = [];
	vscode.window.onDidChangeTextEditorSelection(
		event => {
		  let editor = event.textEditor;
		  if (editor && editor.document.uri.scheme === "list-last-modified-files") {
			if (event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
			  const pos = event.selections[0].anchor;
			  const clickable = clickables.find(e => {
				return e.range.contains(pos);
			  });
			  if (clickable) {
				clickable.click(editor);
			  }
			}
		  }
		},
		null,
		d6
	  );

	context.subscriptions.push(d0, d1, d2, d3, alreadyClickedDecor, d4[0], d5[0], d6[0]);

}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}

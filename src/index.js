const http = require('http');
const url = require('url');
const {Server} = require('ws');
const Emitter = require('events');
const path = require('path');
const fetch = require('node-fetch');
const clc = require('cli-color');

/**
 * Configuration the default user data path. Just for debug.
 * @readonly
 */
const DEFAULT_USER_DATA_PATH = path.join(__dirname, '../../.coconutData');

/**
 * Configuration the default tools path.
 * @readonly
 */
const DEFAULT_TOOLS_PATH = path.join(__dirname, '../tools');

/**
 * Configuration the default host.
 * @readonly
 */
const DEFAULT_HOST = '0.0.0.0';

/**
 * Configuration the default port.
 * @readonly
 */
const DEFAULT_PORT = 20111;

/**
 * Server name, ues in root path.
 * @readonly
 */
const SERVER_NAME = 'scratch-link-server';

/**
 * The time interval for retrying to open the port after the port is occupied by another openblock-resource server.
 * @readonly
 */
const REOPEN_INTERVAL = 1000 * 1;

/**
 * Configuration the server routers.
 * @readonly
 */
const ROUTERS = {
    '/status': require('./session/link'),
    '/scratch/ble': require('./session/ble'), // eslint-disable-line global-require
    '/scratch/serialport': require('./session/serialport') // eslint-disable-line global-require
};

/**
 * A server to provide local hardware api.
 */
class ScratchLink extends Emitter{
    /**
     * Construct a OpenBlock link server object.
     * @param {string} userDataPath - the path to save user data.
     * @param {string} toolsPath - the path of build and flash tools.
     */
    constructor (userDataPath, toolsPath) {
        super();

        if (userDataPath) {
            this.userDataPath = path.join(userDataPath, 'link');
        } else {
            this.userDataPath = path.join(DEFAULT_USER_DATA_PATH, 'link');
        }

        if (toolsPath) {
            this.toolsPath = toolsPath;
        } else {
            this.toolsPath = DEFAULT_TOOLS_PATH;
        }

        this._port = DEFAULT_PORT;
        this._host = DEFAULT_HOST;
        this._httpServer = new http.Server();
        // this._httpServer = http.createServer();
        this._socketServer = new Server({server: this._httpServer});

        this._socketServer.on('connection', (socket, request) => {
            const {pathname} = url.parse(request.url);
            const Session = ROUTERS[pathname];
            let session;
            if (Session) {
                session = new Session(socket, this.userDataPath, this.toolsPath);
                console.info('new connection');
                this.emit('new-connection');
            } else {
                return socket.close();
            }
            const dispose = () => {
                if (session) {
                    session.dispose();
                    session = null;
                }
            };
            socket.on('close', dispose);
            socket.on('error', dispose);
        })
            .on('error', e => {
                if (e.code !== 'EADDRINUSE') {
                    console.error(clc.red(`ERR!: ${e}`));
                }
            });
    }

    isSameServer (host, port) {
        return new Promise((resolve, reject) => {
            fetch(`http://${host}:${port}`)
                .then(res => res.text())
                .then(text => {
                    if (text === SERVER_NAME) {
                        return resolve(true);
                    }
                    return resolve(false);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Initial and Check tools, libraries and firmware update.
     */
    async start () {
        try {
            // Download index.json
            const repo = 'scratch-arduino-link';
            const indexPath = path.resolve(this.toolsPath);
            const filterAsset = asset => (asset.name.indexOf('index.json') >= 0);
            await downloadRelease(user, repo, indexPath, filterRelease, filterAsset, leaveZipped)
                .then(() => {
                    console.log('index.json download complete.');
                })
                .catch(err => {
                    console.error(err.message);
                });
            const linkPackages = await loadJsonFile(path.join(indexPath, 'index.json'));

            // scratch-arduino-libraries
            const librariesRepo = 'scratch-arduino-libraries';
            const libraryPath = path.join(path.resolve(this.toolsPath), '/Arduino/libraries');
            const oldLibraryVersionPath = path.join(libraryPath, 'library-version.json');
            const oldLibraryVersion = await loadJsonFile(oldLibraryVersionPath);
            for (const library of linkPackages['libraries']) {
                if (!fs.existsSync(path.join(libraryPath, library['folderName']))) {
                    const libraryFilterAsset = asset => (asset.name.indexOf(library['libraryName']) >= 0);
                    await downloadRelease(user, librariesRepo, libraryPath, filterRelease, libraryFilterAsset, leaveZipped)
                        .then(() => {
                            console.log(library['fileName'], ' download complete.');
                        }).catch(err => {
                            console.error(err.message);
                        });
                } else {
                    if (!oldLibraryVersion.hasOwnProperty(library['libraryName']) || (library['version'] > oldLibraryVersion[library['libraryName']])) {
                        fs.rmdir(path.join(libraryPath, library['folderName']), { recursive: true }, (error) => {console.error(error);});
                        const libraryFilterAsset = asset => (asset.name.indexOf(library['libraryName']) >= 0);
                        await downloadRelease(user, librariesRepo, libraryPath, filterRelease, libraryFilterAsset, leaveZipped)
                            .then(() => {
                                console.log(library['fileName'], ' download complete.');
                            }).catch(err => {
                                console.error(err.message);
                            });
                    }
                }
            }
            let libraryData = {};      // Save current arduino library version
            for (const library of linkPackages['libraries']) {
                libraryData[library['libraryName']] = library['version'];
            }
            fs.writeFileSync(oldLibraryVersionPath, JSON.stringify(libraryData));

            // scratch-arduino-firmwares
            const firmwaresRepo = 'scratch-arduino-firmwares';
            const firmwarePath = path.join(path.resolve(this.toolsPath), '../firmwares');
            const oldFirmwareVersionPath = path.join(firmwarePath, 'firmware-version.json');
            if (!fs.existsSync(firmwarePath)) {
                fs.mkdirSync(firmwarePath, {recursive: true});
            }
            if (!fs.existsSync(oldFirmwareVersionPath)) {
                for (const firmware of linkPackages['firmwares']) {
                    const libraryFilterAsset = asset => (asset.name.indexOf(firmware['firmwareName']) >= 0);
                    await downloadRelease(user, firmwaresRepo, firmwarePath, filterRelease, libraryFilterAsset, leaveZipped)
                        .then(() => {
                            console.log(firmware['fileName'], ' download complete.');
                        }).catch(err => {
                            console.error(err.message);
                        });
                }
            } else {
                const oldFirmwareVersion = await loadJsonFile(oldFirmwareVersionPath);
                for (const firmware of linkPackages['firmwares']) {
                    if (!oldFirmwareVersion.hasOwnProperty(firmware['firmwareName']) || (firmware['version'] > oldFirmwareVersion[firmware['firmwareName']])) {
                        const libraryFilterAsset = asset => (asset.name.indexOf(firmware['firmwareName']) >= 0);
                        await downloadRelease(user, firmwaresRepo, firmwarePath, filterRelease, libraryFilterAsset, leaveZipped)
                            .then(() => {
                                console.log(firmware['fileName'], ' download complete.');
                            }).catch(err => {
                                console.error(err.message);
                            });
                    }
                }
            }
            let firmwareData = {};      // Save current firmware version
            for (const firmware of linkPackages['firmwares']) {
                firmwareData[firmware['firmwareName']] = firmware['version'];
            }
            fs.writeFileSync(oldFirmwareVersionPath, JSON.stringify(firmwareData));
        } catch(err) {
            dialog.showMessageBox({
                title: 'Scratch COCONUT Link',
                type: 'error',
                buttons: ['Close'],
                message: 'Update error - ' + err.message
            });
        }
    }

    /**
     * Start a server listening for connections.
     * @param {number} port - the port to listen.
     * @param {string} host - the host to listen.
     */
    listen (port, host) {
        if (port) {
            this._port = port;
        }
        if (host) {
            this._host = host;
        }

        this._httpServer.on('request', (request, res) => {
            if (request.url === '/') {
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end(SERVER_NAME);
            }
        });

        this._httpServer.on('error', e => {
            this.isSameServer('127.0.0.1', this._port).then(isSame => {
                if (isSame) {
                    console.log(`Port is already used by other scratch-link server, will try reopening after ${REOPEN_INTERVAL} ms`); // eslint-disable-line max-len
                    setTimeout(() => {
                        this._httpServer.close();
                        this._httpServer.listen(this._port, this._host);
                    }, REOPEN_INTERVAL);
                    this.emit('port-in-use');
                } else {
                    const info = `ERR!: error while trying to listen port ${this._port}: ${e}`;
                    console.error(clc.red(info));
                    this.emit('error', info);
                }
            });
        });

        // this._httpServer.listen(this._port, '0.0.0.0', () => {
        //     this.emit('ready');
        //     console.info(clc.green(`Scratch link server start successfully, socket listen on: http://${this._host}:${this._port}`));
        // });
        this._httpServer.listen(this._port, '127.0.0.1', () => {
            this.emit('ready');
            console.log('socket server listen: ', `http://127.0.0.1:${this._port}`);
        });
    }
}

module.exports = ScratchLink;

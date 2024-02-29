const downloadRelease = require('download-github-release');
const path = require('path');
const os = require('os');
const fs = require('fs');

// const user = 'OttawaSTEM';
// const repo = 'scratch-arduino-tools';
const user = 'huintech';
const repo = 'coconut-tools';
const outputdir = path.resolve('./tools');
const leaveZipped = false;

const filterRelease = release => release.prerelease === false;

const parseArgs = function () {
    const scriptArgs = process.argv.slice(2); // remove `node` and `this-script.js`
    let arch = null;

    for (const arg of scriptArgs) {
        const archSplit = arg.split(/--arch(\s+|=)/);
        if (archSplit.length === 3) {
            arch = archSplit[2];
        }
    }
    return arch;
};

const arch = parseArgs() || os.arch();

// const filterAsset = asset => (asset.name.indexOf(os.platform()) >= 0) &&
//     (asset.name.indexOf(arch) >= 0);

const filterAsset = asset => {
    if (process.platform === 'win32') {
        return (asset.name.indexOf('Win') >= 0);
    } else if (process.platform === 'darwin') {
        return (asset.name.indexOf('Mac') >= 0);
    }
}

if (!fs.existsSync(outputdir)) {
    fs.mkdirSync(outputdir, {recursive: true});
}

downloadRelease(user, repo, outputdir, filterRelease, filterAsset, leaveZipped)
    .then(() => {
        console.log('Tools download complete');
    })
    .catch(err => {
        console.error(err.message);
    });

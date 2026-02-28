import os from 'os';
import path from 'path';
import fs from 'fs';

export type BrowserName = 'chrome' | 'edge' | 'firefox' | 'safari' | 'arc';

export interface BrowserConfig {
    name: BrowserName;
    cookiesPath: string;
    /** For Windows Chromium: directory containing Local State (for DPAPI key) */
    userDataDir?: string;
    osCryptName?: string; // e.g. 'Chrome Safe Storage'
    osCryptAccount?: string; // e.g. 'Chrome'
}

export function getBrowserPaths(): BrowserConfig[] {
    const home = os.homedir();
    const platform = process.platform;
    const browsers: BrowserConfig[] = [];

    if (platform === 'darwin') { // macOS
        // Chrome
        const chromePath = path.join(home, 'Library/Application Support/Google/Chrome/Default/Cookies');
        if (fs.existsSync(chromePath)) {
            browsers.push({
                name: 'chrome',
                cookiesPath: chromePath,
                osCryptName: 'Chrome Safe Storage',
                osCryptAccount: 'Chrome'
            });
        }

        // Arc
        const arcPath = path.join(home, 'Library/Application Support/Arc/User Data/Default/Cookies');
        if (fs.existsSync(arcPath)) {
            browsers.push({
                name: 'arc',
                cookiesPath: arcPath,
                osCryptName: 'Arc Safe Storage',
                osCryptAccount: 'Arc'
            });
        }

        // Edge
        const edgePath = path.join(home, 'Library/Application Support/Microsoft Edge/Default/Cookies');
        if (fs.existsSync(edgePath)) {
            browsers.push({
                name: 'edge',
                cookiesPath: edgePath,
                osCryptName: 'Microsoft Edge Safe Storage',
                osCryptAccount: 'Microsoft Edge'
            });
        }

        // Firefox
        const firefoxDir = path.join(home, 'Library/Application Support/Firefox/Profiles');
        if (fs.existsSync(firefoxDir)) {
            const profiles = fs.readdirSync(firefoxDir);
            for (const profile of profiles) {
                const cookiesPath = path.join(firefoxDir, profile, 'cookies.sqlite');
                if (fs.existsSync(cookiesPath)) {
                    browsers.push({ name: 'firefox', cookiesPath });
                }
            }
        }

        // Safari (Unsupported directly via SQLite usually, requires binarycookies parser)
        // We will skip safari or return a specific path to binarycookies
    } else if (platform === 'win32') { // Windows
        const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        const roamingAppData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

        // Chrome
        const chromeUserData = path.join(localAppData, 'Google', 'Chrome', 'User Data');
        const chromePath = path.join(chromeUserData, 'Default', 'Network', 'Cookies');
        const chromePathLegacy = path.join(chromeUserData, 'Default', 'Cookies');
        const chromeCookiesPath = fs.existsSync(chromePath) ? chromePath : chromePathLegacy;
        if (fs.existsSync(chromeCookiesPath)) {
            browsers.push({ name: 'chrome', cookiesPath: chromeCookiesPath, userDataDir: chromeUserData, osCryptName: 'Chrome' });
        }

        // Edge
        const edgeUserData = path.join(localAppData, 'Microsoft', 'Edge', 'User Data');
        const edgePath = path.join(edgeUserData, 'Default', 'Network', 'Cookies');
        const edgePathLegacy = path.join(edgeUserData, 'Default', 'Cookies');
        const edgeCookiesPath = fs.existsSync(edgePath) ? edgePath : edgePathLegacy;
        if (fs.existsSync(edgeCookiesPath)) {
            browsers.push({ name: 'edge', cookiesPath: edgeCookiesPath, userDataDir: edgeUserData, osCryptName: 'Edge' });
        }

        // Firefox
        const firefoxDir = path.join(roamingAppData, 'Mozilla/Firefox/Profiles');
        if (fs.existsSync(firefoxDir)) {
            const profiles = fs.readdirSync(firefoxDir);
            for (const profile of profiles) {
                const cookiesPath = path.join(firefoxDir, profile, 'cookies.sqlite');
                if (fs.existsSync(cookiesPath)) {
                    browsers.push({ name: 'firefox', cookiesPath });
                }
            }
        }
    } else if (platform === 'linux') { // Linux
        // Chrome
        const chromePath = path.join(home, '.config/google-chrome/Default/Cookies');
        if (fs.existsSync(chromePath)) {
            browsers.push({ name: 'chrome', cookiesPath: chromePath, osCryptName: 'Chrome Safe Storage' });
        }

        // Edge
        const edgePath = path.join(home, '.config/microsoft-edge/Default/Cookies');
        if (fs.existsSync(edgePath)) {
            browsers.push({ name: 'edge', cookiesPath: edgePath, osCryptName: 'Microsoft Edge Safe Storage' });
        }

        // Firefox
        const firefoxDir = path.join(home, '.mozilla/firefox');
        if (fs.existsSync(firefoxDir)) {
            const profiles = fs.readdirSync(firefoxDir);
            for (const profile of profiles) {
                const cookiesPath = path.join(firefoxDir, profile, 'cookies.sqlite');
                if (fs.existsSync(cookiesPath)) {
                    browsers.push({ name: 'firefox', cookiesPath });
                }
            }
        }
    }

    return browsers;
}
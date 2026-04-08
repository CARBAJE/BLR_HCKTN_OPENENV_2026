/**
 * initialState.js
 *
 * Exports:
 *   createInitialState() — factory with randomized visual config + synthetic FS.
 *   randomVisualConfig() — exported for RANDOMIZE_UI in reducer.
 */

// ─── Synthetic FS helpers ─────────────────────────────────────────────────────

const LOREM_WORDS = [
  'lorem','ipsum','dolor','sit','amet','consectetur','adipiscing','elit',
  'sed','do','eiusmod','tempor','incididunt','ut','labore','et','dolore',
  'magna','aliqua','enim','ad','minim','veniam','quis','nostrud','exercitation',
  'ullamco','laboris','nisi','aliquip','ex','ea','commodo','consequat',
  'duis','aute','irure','in','reprehenderit','voluptate','velit','esse',
  'cillum','fugiat','nulla','pariatur','excepteur','sint','occaecat',
  'cupidatat','non','proident','sunt','culpa','qui','officia','deserunt',
  'mollit','anim','id','est','laborum',
];

function loremIpsum(wordCount = 60) {
  const words = [];
  for (let i = 0; i < wordCount; i++)
    words.push(LOREM_WORDS[Math.floor(Math.random() * LOREM_WORDS.length)]);

  const sentences = [];
  let i = 0;
  while (i < words.length) {
    const len = 8 + Math.floor(Math.random() * 8);
    const chunk = words.slice(i, i + len);
    chunk[0] = chunk[0][0].toUpperCase() + chunk[0].slice(1);
    sentences.push(chunk.join(' ') + '.');
    i += len;
  }
  return sentences.join(' ');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ALL_TXT = [
  'notes.txt','log.txt','report.txt','config.txt',
  'memo.txt','draft.txt','summary.txt','todo.txt','ideas.txt',
  'changelog.txt','instructions.txt','license.txt','data.txt',
];
const ALL_EXE = [
  'setup.exe','updater.exe','launcher.exe',
  'helper.exe','service.exe','manager.exe',
];
const ALL_FOLDERS = [
  'Projects','Backup','Work','Personal','Archive','Media','Assets',
];

const FILE_ICONS = ['/assets/icons/file_1.png', '/assets/icons/file_2.png'];
const EXE_ICONS  = ['/assets/icons/exe_1.png',  '/assets/icons/exe_2.png'];

function makeTxt(name) {
  return {
    type:    'file',
    ext:     'txt',
    size:    `${1 + Math.floor(Math.random() * 20)} KB`,
    icon:    pick(FILE_ICONS),
    content: loremIpsum(50 + Math.floor(Math.random() * 80)),
  };
}
function makeExe(name) {
  return {
    type: 'file',
    ext:  'exe',
    size: `${(0.5 + Math.random() * 4).toFixed(1)} MB`,
    icon: pick(EXE_ICONS),
  };
}
function makeFolder() {
  return { type: 'folder', children: {} };
}

/**
 * Generates a mix of txt files, exe files and folders.
 * @param {{ folders?: number, txt?: number, exe?: number }} counts
 */
function syntheticFiles({ folders = 1, txt = 3, exe = 1 } = {}) {
  const result = {};
  shuffle(ALL_FOLDERS).slice(0, folders).forEach((n) => { result[n] = makeFolder(); });
  shuffle(ALL_TXT).slice(0, txt).forEach((n)     => { result[n] = makeTxt(n); });
  shuffle(ALL_EXE).slice(0, exe).forEach((n)     => { result[n] = makeExe(n); });
  return result;
}

// ─── File system factory ──────────────────────────────────────────────────────

function buildFileSystem() {
  return {
    'C:': {
      type: 'drive',
      children: {
        Windows: {
          type: 'folder',
          children: { System32: { type: 'folder', children: {} } },
        },
        Users: {
          type: 'folder',
          children: {
            Admin: {
              type: 'folder',
              children: {
                // Desktop starts with synthetic files
                Desktop: {
                  type: 'folder',
                  children: syntheticFiles({ folders: 1, txt: 2, exe: 1 }),
                },
                // Downloads always has the real Python installer + synthetic files
                Downloads: {
                  type: 'folder',
                  children: {
                    'python-3.12.0-amd64.exe': {
                      type:      'file',
                      ext:       'exe',
                      size:      '24.5 MB',
                      icon:      '/assets/icons/exe_1.png',
                      component: 'PythonInstaller',   // opens the real installer
                    },
                    ...syntheticFiles({ folders: 0, txt: 1, exe: 0 }),
                  },
                },
                // Documents with text files (readme.txt is always present for RL tasks)
                Documents: {
                  type: 'folder',
                  children: {
                    'readme.txt': {
                      type:    'file',
                      ext:     'txt',
                      size:    '2 KB',
                      icon:    '/assets/icons/file_1.png',
                      content: 'Welcome to OSaaS.\n\nThis system simulates a desktop operating system environment.\nYou can open files, run programs, and explore the file system.\n\nFor help, open the Terminal and type "help".',
                    },
                    ...syntheticFiles({ folders: 1, txt: 2, exe: 0 }),
                  },
                },
                AppData: {
                  type: 'folder',
                  children: {
                    Local: {
                      type: 'folder',
                      children: { Temp: { type: 'folder', children: {} } },
                    },
                  },
                },
              },
            },
          },
        },
        'Program Files':       { type: 'folder', children: {} },
        'Program Files (x86)': { type: 'folder', children: {} },
      },
    },
  };
}

// ─── Visual randomizer ────────────────────────────────────────────────────────

const TASKBAR_POSITIONS = ['top', 'bottom', 'left', 'right'];
const ACCENT_COLORS = [
  '#0078d4','#e74c3c','#27ae60','#8e44ad',
  '#e67e22','#16a085','#c0392b','#2980b9',
  '#d35400','#1abc9c',
];
const FONT_FAMILIES = [
  '"Segoe UI", system-ui, sans-serif',
  '"Courier New", monospace',
  '"Georgia", serif',
  'Arial, sans-serif',
];
const DESKTOP_BACKGROUNDS = [
  '#1e3a5f','#2d1b33','#1a2e1a',
  '#2e2a1a','#1a2a2e','#1c1c2e',
  '#2a1a1a','#1a1e2e',
];
const TASKBAR_BACKGROUNDS = [
  '#1a1a2e','#0d0d1a','#1a2a1a',
  '#1a1a1a','#2a1a2e','#0a1a2a',
];
const DPI_SCALES = [0.85, 1.0, 1.15, 1.25];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const WALLPAPER_COUNT = 5;   // bg_1.jpg … bg_5.jpg

export function randomVisualConfig() {
  const accent    = pick(ACCENT_COLORS);
  const bgIndex   = 1 + Math.floor(Math.random() * WALLPAPER_COUNT);
  return {
    accentColor:     accent,
    taskbarPosition: pick(TASKBAR_POSITIONS),
    fontFamily:      pick(FONT_FAMILIES),
    desktopBg:       pick(DESKTOP_BACKGROUNDS),   // fallback color
    desktopBgImage:  `/assets/wallpapers/bg_${bgIndex}.jpg`,
    wallpaper:       `bg_${bgIndex}.jpg`,          // human-readable, used by getState
    taskbarBg:       pick(TASKBAR_BACKGROUNDS),
    titleBg:         accent,
    windowBg:        '#f0f0f0',
    dpiScale:        pick(DPI_SCALES),
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createInitialState() {
  return {
    fileSystem:           buildFileSystem(),
    environmentVariables: {
      PATH:         'C:\\Windows\\System32;C:\\Windows',
      USERPROFILE:  'C:\\Users\\Admin',
      TEMP:         'C:\\Users\\Admin\\AppData\\Local\\Temp',
      OS:           'Windows_NT',
      COMPUTERNAME: 'DESKTOP-OSaaS',
    },
    installedApps:   ['Cmd', 'Explorer', 'Notepad'],
    windowsStack:    [],
    visualConfig:    randomVisualConfig(),
    startMenuOpen:   false,
    clipboard:       '',
    focusedWindowId: null,
    nextWinId:       1,
    terminalLines: [
      'Microsoft Windows [Version 10.0.22631.3880]',
      '(c) Microsoft Corporation. All rights reserved.',
      '',
      'C:\\Users\\Admin> ',
    ],
    terminalInput: '',
    currentDir:    'C:\\Users\\Admin',
    lastAction:    null,
    eventLog:      [],
  };
}

export default createInitialState();

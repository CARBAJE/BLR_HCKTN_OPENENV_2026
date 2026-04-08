/**
 * reducer.js
 *
 * The OS Kernel — a pure function that maps (state, action) → newState.
 * All state mutations happen here. No side effects.
 *
 * Action types mirror OS-level operations:
 *   Window management, environment, file system, UI configuration, terminal I/O.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Computes the default position and size for a new window,
 * staggered by window ID to avoid perfect overlap.
 */
function defaultWindowGeometry(id, w = 620, h = 440) {
  return {
    x: 60 + (id % 6) * 28,
    y: 40 + (id % 5) * 20,
    w,
    h,
  };
}

/**
 * Unfocuses all windows in the stack, then focuses the given id.
 */
function setFocused(stack, id) {
  return stack.map((w) => ({ ...w, focused: w.id === id }));
}

/**
 * Deep-clones the file system safely via JSON round-trip.
 * Acceptable for this data size; avoids accidental mutation.
 */
function cloneFs(fs) {
  return JSON.parse(JSON.stringify(fs));
}

/**
 * Genera dimensiones y posición aleatorias para una ventana.
 * Mantiene la ventana dentro de límites razonables para que sea visible.
 */
function generateRandomGeometry(containerW = 1024, containerH = 768) {
  // Rango de tamaños (Min 400x300, Max 800x600)
  const w = Math.floor(Math.random() * (800 - 400 + 1)) + 400;
  const h = Math.floor(Math.random() * (600 - 300 + 1)) + 300;

  // Rango de posición (asegurando que no se salga de la pantalla)
  const maxX = Math.max(0, containerW - w - 50);
  const maxY = Math.max(0, containerH - h - 50);

  const x = Math.floor(Math.random() * maxX) + 20;
  const y = Math.floor(Math.random() * maxY) + 20;

  return { x, y, w, h };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export default function reducer(state, action) {
  switch (action.type) {

    // ── Window Management ────────────────────────────────────────────────────

    case 'OPEN_WINDOW': {
      const id = state.nextWinId;

      // Usamos la nueva lógica aleatoria
      // Si el action trae dimensiones fijas (w, h), las usamos pero aleatorizamos x, y
      const randomGeo = generateRandomGeometry();

      const newWin = {
        id,
        title: action.title,
        component: action.component,
        x: action.x || randomGeo.x,
        y: action.y || randomGeo.y,
        w: action.w || randomGeo.w,
        h: action.h || randomGeo.h,
        focused: true,
        props: action.props || {},
      };

      return {
        ...state,
        windowsStack: setFocused(state.windowsStack, id).concat(newWin),
        nextWinId: id + 1,
        focusedWindowId: id,
        startMenuOpen: false,
        lastAction: `OPEN_WINDOW_${action.component}`,
      };
    }

    case 'CLOSE_WINDOW': {
      const remaining = state.windowsStack.filter((w) => w.id !== action.id);
      const newFocus = remaining.length ? remaining[remaining.length - 1].id : null;
      return {
        ...state,
        windowsStack: remaining,
        focusedWindowId: newFocus,
        lastAction: 'CLOSE_WINDOW',
      };
    }

    case 'FOCUS_WINDOW':
      return {
        ...state,
        windowsStack: state.windowsStack.map((w) =>
          w.id === action.id
            ? { ...w, focused: true, minimized: false }   // also restores minimized
            : { ...w, focused: false }
        ),
        focusedWindowId: action.id,
        lastAction: 'FOCUS_WINDOW',
      };

    case 'MOVE_WINDOW':
      return {
        ...state,
        windowsStack: state.windowsStack.map((w) =>
          w.id === action.id ? { ...w, x: action.x, y: action.y } : w
        ),
      };

    case 'RESIZE_WINDOW':
      return {
        ...state,
        windowsStack: state.windowsStack.map((w) =>
          w.id === action.id ? { ...w, w: action.w, h: action.h } : w
        ),
      };

    case 'MINIMIZE_WINDOW': {
      const remaining = state.windowsStack.filter((w) => w.id !== action.id || !w.minimized);
      const newFocus  = remaining.find((w) => !w.minimized && w.id !== action.id)?.id ?? null;
      return {
        ...state,
        windowsStack: state.windowsStack.map((w) =>
          w.id === action.id ? { ...w, minimized: true, focused: false } : w
        ),
        focusedWindowId: newFocus,
        lastAction: 'MINIMIZE_WINDOW',
      };
    }

    case 'MAXIMIZE_WINDOW':
      return {
        ...state,
        windowsStack: state.windowsStack.map((w) => {
          if (w.id !== action.id) return w;
          if (w.maximized) {
            // Restore
            return { ...w, maximized: false, ...(w.prevGeometry ?? {}) };
          } else {
            // Save geometry, then maximize
            return { ...w, maximized: true, prevGeometry: { x: w.x, y: w.y, w: w.w, h: w.h } };
          }
        }),
        lastAction: 'MAXIMIZE_WINDOW',
      };

    // ── Start Menu ───────────────────────────────────────────────────────────

    case 'TOGGLE_START':
      return { ...state, startMenuOpen: !state.startMenuOpen, lastAction: 'TOGGLE_START' };

    case 'CLOSE_START':
      return { ...state, startMenuOpen: false };

    // ── Visual Configuration (UI Variability) ────────────────────────────────

    case 'RANDOMIZE_UI': {
      const fonts     = ['"Segoe UI", system-ui, sans-serif', '"Courier New", monospace', '"Georgia", serif', 'Arial, sans-serif'];
      const positions = ['bottom', 'top', 'left', 'right'];
      const colors    = [
        '#0078d4', '#e74c3c', '#27ae60', '#8e44ad',
        '#e67e22', '#16a085', '#c0392b', '#2980b9',
        '#d35400', '#1abc9c', '#22c55e', '#6366f1',
        '#f59e0b', '#ec4899',
      ];
      const desktopBgs = [
        '#1e3a5f', '#2d1b33', '#1a2e1a',
        '#2e2a1a', '#1a2a2e', '#1c1c2e',
        '#2a1a1a', '#1a1e2e',
      ];
      const taskbarBgs = [
        '#1a1a2e', '#0d0d1a', '#1a2a1a',
        '#1a1a1a', '#2a1a2e', '#0a1a2a',
      ];
      const dpiScales = [0.85, 1.0, 1.15, 1.25];

      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const accent = pick(colors);

      return {
        ...state,
        visualConfig: {
          accentColor:     accent,
          taskbarPosition: pick(positions),
          fontFamily:      pick(fonts),
          desktopBg:       pick(desktopBgs),
          desktopBgImage:  null,
          taskbarBg:       pick(taskbarBgs),
          titleBg:         accent,
          windowBg:        '#f0f0f0',
          dpiScale:        pick(dpiScales),
        },
        lastAction: 'RANDOMIZE_UI',
      };
    }

    // ── Clipboard ────────────────────────────────────────────────────────────

    case 'CLIPBOARD_SET':
      return { ...state, clipboard: action.text, lastAction: 'CLIPBOARD_SET' };

    // ── Terminal ─────────────────────────────────────────────────────────────

    case 'TERMINAL_INPUT':
      return { ...state, terminalInput: action.value };

    case 'TERMINAL_EXEC': {
      const raw = state.terminalInput.trim();
      const args = raw.split(/\s+/);
      const cmd = args[0].toLowerCase();

      // Stamp the executed command into the last line
      const lines = [...state.terminalLines];
      lines[lines.length - 1] = `${state.currentDir}> ${raw}`;

      let output = [];

      if (!raw) {
        // no-op
      } else if (cmd === 'cls' || cmd === 'clear') {
        lines.length = 0;
      } else if (cmd === 'echo') {
        output = [args.slice(1).join(' ')];
      } else if (cmd === 'dir' || cmd === 'ls') {
        output = [
          ` Directory of ${state.currentDir}`,
          '',
          '  <DIR>  .    ',
          '  <DIR>  ..   ',
          '         python-3.12.0-amd64.exe    24,576 KB',
        ];
      } else if (cmd === 'python' || cmd === 'python3') {
        if (state.installedApps.includes('Python')) {
          output = ['Python 3.12.0 (tags/v3.12.0:0fb18b0, Oct  2 2023, 13:03:39)', '>>> '];
        } else {
          output = ["'python' is not recognized as an internal or external command,", 'operable program or batch file.'];
        }
      } else if (cmd === 'path') {
        output = [state.environmentVariables.PATH];
      } else if (cmd === 'set') {
        output = Object.entries(state.environmentVariables).map(([k, v]) => `${k}=${v}`);
      } else if (cmd === 'open' || cmd === 'start') {
        const filename = args.slice(1).join(' ');
        if (!filename) {
          output = ['Usage: open <filename>', 'Opens a file in the appropriate viewer.'];
        } else {
          // Search current dir, then Documents, Desktop, Downloads
          const searchDirs = [
            state.currentDir.split('\\').filter(Boolean),
            ['C:', 'Users', 'Admin', 'Documents'],
            ['C:', 'Users', 'Admin', 'Desktop'],
            ['C:', 'Users', 'Admin', 'Downloads'],
          ];
          let foundFile = null;
          let foundPath = null;
          for (const dirPath of searchDirs) {
            let node = state.fileSystem[dirPath[0]];
            for (let i = 1; i < dirPath.length; i++) {
              node = node?.children?.[dirPath[i]];
              if (!node) break;
            }
            if (node?.children?.[filename]) {
              foundFile = node.children[filename];
              foundPath = [...dirPath, filename];
              break;
            }
          }

          if (!foundFile) {
            output = [`The system cannot find the file '${filename}'.`];
          } else if (foundFile.type === 'folder') {
            output = [`Opening folder ${filename}...`];
            const id = state.nextWinId;
            const geo = generateRandomGeometry();
            return {
              ...state,
              terminalLines: [...lines, ...output, '', `${state.currentDir}> `],
              terminalInput: '',
              windowsStack: setFocused(state.windowsStack, id).concat({
                id, title: 'File Explorer', component: 'Explorer',
                ...geo, focused: true, props: {},
              }),
              nextWinId: id + 1,
              focusedWindowId: id,
              lastAction: 'TERMINAL_EXEC',
            };
          } else if (foundFile.ext === 'txt') {
            output = [`Opening ${filename}...`];
            const id = state.nextWinId;
            const geo = generateRandomGeometry();
            return {
              ...state,
              terminalLines: [...lines, ...output, '', `${state.currentDir}> `],
              terminalInput: '',
              windowsStack: setFocused(state.windowsStack, id).concat({
                id, title: filename, component: 'TextViewer',
                ...geo, focused: true,
                props: { content: foundFile.content || '', filename, filePath: foundPath },
              }),
              nextWinId: id + 1,
              focusedWindowId: id,
              lastAction: 'TERMINAL_EXEC',
            };
          } else if (foundFile.ext === 'exe') {
            output = [`Running ${filename}...`];
            const id = state.nextWinId;
            const geo = generateRandomGeometry();
            const comp = foundFile.component || 'SystemRunner';
            return {
              ...state,
              terminalLines: [...lines, ...output, '', `${state.currentDir}> `],
              terminalInput: '',
              windowsStack: setFocused(state.windowsStack, id).concat({
                id, title: comp === 'PythonInstaller' ? 'Python 3.12.0 Setup' : filename,
                component: comp,
                ...geo, focused: true, props: { filename },
              }),
              nextWinId: id + 1,
              focusedWindowId: id,
              lastAction: 'TERMINAL_EXEC',
            };
          } else {
            output = [`Cannot open '${filename}': unsupported file type.`];
          }
        }
      } else if (cmd === 'help') {
        output = [
          'Available commands:',
          '  cls / clear      Clear the terminal',
          '  echo <text>      Print text',
          '  dir / ls         List directory contents',
          '  cd               Show current directory',
          '  open <file>      Open a file (searches Documents, Desktop, Downloads)',
          '  python           Launch Python (if installed)',
          '  path             Show PATH variable',
          '  set              Show environment variables',
          '  help             Show this help message',
        ];
      } else if (cmd === 'cd') {
        // simplified cd
        output = [state.currentDir];
      } else {
        output = [`'${args[0]}' is not recognized as an internal or external command,`, 'operable program or batch file.'];
      }

      return {
        ...state,
        terminalLines: [...lines, ...output, '', `${state.currentDir}> `],
        terminalInput: '',
        lastAction: 'TERMINAL_EXEC',
      };
    }

    // ── Python Installation ───────────────────────────────────────────────────

    case 'INSTALL_PYTHON_COMPLETE': {
      // 1. Update environment variables
      const newEnv = action.addPath
        ? {
          ...state.environmentVariables,
          PATH: `${state.environmentVariables.PATH};C:\\Python312;C:\\Python312\\Scripts`,
        }
        : state.environmentVariables;

      // 2. Register application
      const newApps = state.installedApps.includes('Python')
        ? state.installedApps
        : [...state.installedApps, 'Python'];

      // 3. Write to file system
      const newFs = cloneFs(state.fileSystem);
      newFs['C:'].children['Python312'] = {
        type: 'folder',
        children: {
          'python.exe': { type: 'file', size: '98 KB', icon: '🐍' },
          'pythonw.exe': { type: 'file', size: '97 KB', icon: '🐍' },
          'pip.exe': { type: 'file', size: '84 KB', icon: '📦' },
          'LICENSE.txt': { type: 'file', size: '12 KB', icon: '📄' },
          'README.txt': { type: 'file', size: '4 KB', icon: '📄' },
          Scripts: { type: 'folder', children: {} },
          Lib: { type: 'folder', children: {} },
          DLLs: { type: 'folder', children: {} },
        },
      };

      return {
        ...state,
        fileSystem: newFs,
        environmentVariables: newEnv,
        installedApps: newApps,
        lastAction: 'INSTALL_PYTHON_COMPLETE',
      };
    }

    // ── File System Write ─────────────────────────────────────────────────────

    case 'WRITE_FILE': {
      // action.filePath: ['C:', 'Users', 'Admin', 'Desktop', 'notes.txt']
      // action.content:  string
      const newFs = cloneFs(state.fileSystem);
      let node = newFs['C:'];
      for (let i = 1; i < action.filePath.length - 1; i++) {
        node = node?.children?.[action.filePath[i]];
        if (!node) break;
      }
      const filename = action.filePath[action.filePath.length - 1];
      if (node?.children?.[filename]) {
        node.children[filename].content = action.content;
      }
      return { ...state, fileSystem: newFs, lastAction: 'WRITE_FILE' };
    }

    // ── Environment Variables ─────────────────────────────────────────────────

    case 'SET_ENV_VAR':
      return {
        ...state,
        environmentVariables: {
          ...state.environmentVariables,
          [action.key]: action.value,
        },
        lastAction: 'SET_ENV_VAR',
      };

    // ── Event Log (Observability) ─────────────────────────────────────────────

    case 'LOG_EVENT':
      return {
        ...state,
        eventLog: [action.event, ...state.eventLog.slice(0, 49)],
        lastAction: action.event.action,
      };

    default:
      return state;
  }
}

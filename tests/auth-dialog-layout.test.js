import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auth = readFileSync(new URL('../src/features/auth/AuthenticationControl.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/ui-modernization.css', import.meta.url), 'utf8');

test('sign-in dialog is portalled outside the header while its trigger remains in place', () => {
  assert.match(auth, /import \{ createPortal \} from "react-dom"/);
  assert.match(auth, /document\.querySelector\("\.app"\) \|\| document\.body/);
  assert.match(auth, /dialogOpen && dialogHost && createPortal\(/);
  assert.match(auth, /<div className="auth-dialog-backdrop" role="presentation"/);
  assert.match(auth, /<section className="auth-dialog" role="dialog" aria-modal="true"/);
  assert.match(auth, /dialogHost\s*\)\}/);
  assert.match(auth, /className="auth-header-button" type="button"/);
});

test('auth backdrop centers the dialog with viewport positioning and mobile-safe overflow', () => {
  assert.match(css, /\.app \.auth-dialog-backdrop\s*\{[^}]*position: fixed !important;[^}]*inset: 0 !important;[^}]*align-items: center;[^}]*justify-content: center;/s);
  assert.match(css, /\.app \.auth-dialog-backdrop \.auth-dialog\s*\{[^}]*width: min\(390px, 100%\);[^}]*max-height: calc\(100dvh[^}]*overflow-y: auto;/s);
});

test('sign-in keeps Escape and backdrop-click dismissal', () => {
  assert.match(auth, /event\.key === "Escape"\) setDialogOpen\(false\)/);
  assert.match(auth, /event\.target === event\.currentTarget\) setDialogOpen\(false\)/);
  assert.match(auth, /onClick=\{\(\) => setDialogOpen\(false\)\}/);
});

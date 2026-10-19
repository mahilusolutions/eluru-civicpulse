import { lazy } from 'react';

const FLAG = 'civicpulse_chunk_reload';

/**
 * React.lazy with one automatic reload when the page file can't be fetched. After a new release the
 * old file names no longer exist, so a tab that was left open would otherwise show a blank page.
 */
export default function lazyPage(load) {
  return lazy(() =>
    load()
      .then((mod) => {
        try {
          sessionStorage.removeItem(FLAG);
        } catch {
          /* storage may be blocked */
        }
        return mod;
      })
      .catch((err) => {
        let alreadyTried = false;
        try {
          alreadyTried = sessionStorage.getItem(FLAG) === '1';
          sessionStorage.setItem(FLAG, '1');
        } catch {
          /* storage may be blocked */
        }
        if (!alreadyTried) {
          window.location.reload();
          return new Promise(() => {});
        }
        throw err;
      })
  );
}

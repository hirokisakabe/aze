// db.jsx — IndexedDB setup via Dexie.js
const db = new Dexie('aze');
db.version(1).stores({ notes: 'path, created, updated' });

db.on('populate', () => db.notes.bulkAdd(NOTES));

function useLiveQuery(querier, deps) {
  const [result, setResult] = React.useState(undefined);
  React.useEffect(() => {
    const sub = Dexie.liveQuery(querier).subscribe({
      next: setResult,
      error: (err) => console.error('useLiveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, deps || []);
  return result;
}

Object.assign(window, { db, useLiveQuery });

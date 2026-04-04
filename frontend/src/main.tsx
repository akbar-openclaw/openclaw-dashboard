import React from 'react';
import ReactDOM from 'react-dom/client';

const panels = [
  { title: 'Available agents', endpoint: '/api/agents' },
  { title: 'OpenClaw status', endpoint: '/api/status' },
  { title: 'Shared backlog', endpoint: '/api/backlog' },
  { title: 'Shared rulebook', endpoint: '/api/rulebook' },
];

function App() {
  const [data, setData] = React.useState<Record<string, any>>({});

  React.useEffect(() => {
    Promise.all(panels.map(async p => [p.endpoint, await fetch(p.endpoint).then(r => r.json())]))
      .then(entries => setData(Object.fromEntries(entries)));
  }, []);

  return React.createElement('div', { style: { fontFamily: 'system-ui', padding: '24px', color: '#111', background: '#f6f6f4', minHeight: '100vh' } },
    React.createElement('h1', null, 'Akbar’s personal dashboard'),
    React.createElement('p', null, 'Simple now. Extensible later.'),
    React.createElement('div', { style: { display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' } },
      panels.map(p => React.createElement('section', { key: p.endpoint, style: { background: 'white', border: '1px solid #ddd', borderRadius: '12px', padding: '16px' } },
        React.createElement('h2', { style: { marginTop: 0 } }, p.title),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, JSON.stringify(data[p.endpoint] ?? { loading: true }, null, 2))
      ))
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(React.createElement(App));

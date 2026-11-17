import type { FC } from 'react';

export const App: FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <header className="max-w-4xl mx-auto border-b border-slate-700 pb-4 mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-indigo-400">AI PR Reviewer</h1>
        <p className="text-slate-400 mt-1">Code Quality & Pull Request Analytics Dashboard</p>
      </header>
      <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-slate-800 rounded-lg shadow border border-slate-700">
          <h2 className="text-sm font-medium text-slate-400">System Status</h2>
          <p className="text-2xl font-bold text-emerald-400 mt-2">Operational</p>
        </div>
        <div className="p-6 bg-slate-800 rounded-lg shadow border border-slate-700">
          <h2 className="text-sm font-medium text-slate-400">PRs Analyzed</h2>
          <p className="text-2xl font-bold text-indigo-300 mt-2">0</p>
        </div>
        <div className="p-6 bg-slate-800 rounded-lg shadow border border-slate-700">
          <h2 className="text-sm font-medium text-slate-400">Quality Score</h2>
          <p className="text-2xl font-bold text-amber-300 mt-2">N/A</p>
        </div>
      </main>
    </div>
  );
};

export default App;

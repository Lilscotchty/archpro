import React, { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { MethodStudy } from './components/MethodStudy';
import { PhysicsLab } from './components/PhysicsLab';
import { MeasurementModule } from './components/MeasurementModule';
import { ElevationStudio } from './components/elevation/ElevationStudio';
import type { ElevationStudioProps } from './components/elevation/ElevationStudio';
import { DraftingStudio } from './components/drafting/DraftingStudio';
import { useHistory } from './utils/drafting/history';
import { newProject } from './utils/drafting/project';
import { AppModule, ProjectState } from './types';

const GlobalStyles = () => (
  <style>{`
    .app-bg { background-color: #15171a; min-height: 100vh; color: #c9cfd6; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #15171a; }
    ::-webkit-scrollbar-thumb { background: #2e333a; border-radius: 4px; }
  `}</style>
);

function App() {
  const [activeModule, setActiveModule] = useState<AppModule>(AppModule.DASHBOARD);
  const hist = useHistory<ProjectState>(newProject);
  const [started, setStarted] = useState(false);
  const [studioInitial, setStudioInitial] = useState<ElevationStudioProps['initial']>(undefined);
  const home = () => setActiveModule(AppModule.DASHBOARD);

  const renderContent = () => {
    switch (activeModule) {
      case AppModule.DASHBOARD: return <Dashboard onSelectModule={setActiveModule} />;
      case AppModule.ELEVATIONS: return (
        <ElevationStudio key={studioInitial ? 'handoff' : 'fresh'} initial={studioInitial} onClose={() => { setStudioInitial(undefined); home(); }} />
      );
      case AppModule.METHOD_STUDY: return <MethodStudy onClose={home} />;
      case AppModule.PHYSICS: return <PhysicsLab onClose={home} />;
      case AppModule.MEASUREMENT: return <MeasurementModule project={hist.state} onClose={home} />;
      default: return (
        <DraftingStudio hist={hist} started={started} setStarted={setStarted} onHome={home}
          onElevations={initial => { setStudioInitial(initial); setActiveModule(AppModule.ELEVATIONS); }} />
      );
    }
  };

  return (
    <div className="app-bg font-sans">
      <GlobalStyles />
      {renderContent()}
    </div>
  );
}

export default App;

'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '../../lib/api';
import TabPenjadwalan from '../../components/ppj/TabPenjadwalan';
import TabTracking from '../../components/ppj/TabTracking';
import TabHistory from '../../components/ppj/TabHistory';

type TabKey = 'penjadwalan' | 'tracking' | 'history';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'penjadwalan', label: 'Penjadwalan', icon: 'assignment' },
  { key: 'tracking', label: 'Tracking', icon: 'map' },
  { key: 'history', label: 'History', icon: 'history' },
];

function InspeksiContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>('penjadwalan');
  const [activeTugasId, setActiveTugasId] = useState<number | null>(null);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const handleLogout = () => {
    localStorage.clear();
    router.push('/login');
  };

  // Fetch all tasks
  const fetchAllTasks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/tugas');
      const tasks = res.data.data || [];
      setAllTasks(tasks);

      // Auto-detect: if any task is in_progress, switch to tracking tab
      const inProgress = tasks.find((t: any) => t.status === 'in_progress');
      if (inProgress) {
        setActiveTugasId(inProgress.id);
        setActiveTab('tracking');
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllTasks();
  }, [fetchAllTasks]);

  // Handle URL params for backward compatibility
  useEffect(() => {
    const tab = searchParams.get('tab') as TabKey;
    const id = searchParams.get('id');
    if (tab && TABS.some(t => t.key === tab)) {
      setActiveTab(tab);
    }
    if (id) {
      setActiveTugasId(parseInt(id));
    }
  }, [searchParams]);

  // Filtered task lists for each tab
  const scheduleTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const historyTasks = allTasks.filter(t => t.status === 'completed' || t.status === 'cancelled');

  // Handle start tracking from tab 1
  const handleStartTracking = (tugasId: number) => {
    setActiveTugasId(tugasId);
    setActiveTab('tracking');
  };

  // Handle tracking finished → switch to history + refresh
  const handleTrackingFinished = () => {
    setActiveTugasId(null);
    setActiveTab('history');
    fetchAllTasks(); // Refresh tasks to get updated statuses
  };

  // Handle back from tracking → go to penjadwalan
  const handleBackFromTracking = () => {
    setActiveTab('penjadwalan');
  };

  return (
    <div className="bg-background text-on-surface min-h-screen font-body-lg antialiased flex flex-col">
      {/* Header — hidden when tracking tab is active & has a tugas */}
      {!(activeTab === 'tracking' && activeTugasId) && (
        <header className="bg-surface/80 backdrop-blur-md shadow-sm sticky top-0 z-50 flex items-center justify-between w-full px-container-padding h-16">
          <div className="w-10" />
          <h1 className="font-h2 text-h2 font-bold text-primary tracking-tight">RailTrack PPJ</h1>
          <button
            onClick={handleLogout}
            className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors"
            title="Logout"
          >
            <span className="material-symbols-outlined text-[22px]">logout</span>
          </button>
        </header>
      )}

      {/* Tab Bar — hidden when tracking is active */}
      {!(activeTab === 'tracking' && activeTugasId) && (
        <div className="bg-surface/80 backdrop-blur-md border-b border-outline-variant/50 sticky top-16 z-40">
          <div className="max-w-xl mx-auto flex">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex flex-col items-center gap-1 py-sm transition-all relative ${
                  activeTab === tab.key
                    ? 'text-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[22px]"
                  style={activeTab === tab.key ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {tab.icon}
                </span>
                <span className="font-label-sm text-[11px] font-semibold uppercase tracking-wider">{tab.label}</span>
                {/* Active indicator */}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-1/4 right-1/4 h-[3px] bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content */}
      <main className={`flex-1 flex flex-col ${activeTab === 'tracking' && activeTugasId ? 'h-[calc(100vh)]' : ''}`}>
        {activeTab === 'penjadwalan' && (
          <TabPenjadwalan
            tasks={scheduleTasks}
            loading={loading}
            onStartTracking={handleStartTracking}
          />
        )}

        {activeTab === 'tracking' && (
          <TabTracking
            tugasId={activeTugasId}
            onFinish={handleTrackingFinished}
            onBack={handleBackFromTracking}
          />
        )}

        {activeTab === 'history' && (
          <TabHistory
            tasks={historyTasks}
            loading={loading}
          />
        )}
      </main>
    </div>
  );
}

export default function InspeksiPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-md text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-[48px] animate-spin">refresh</span>
          <p className="font-body-md">Memuat...</p>
        </div>
      </div>
    }>
      <InspeksiContent />
    </Suspense>
  );
}


import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Task, ViewMode, Department } from './types';
import { addDays, startOfDay, formatDate } from './utils/dateUtils';
import { GeminiService } from './services/geminiService';
import GanttChart from './components/GanttChart';
import TaskModal from './components/TaskModal';
import DateSummaryModal from './components/DateSummaryModal';
import DepartmentModal from './components/DepartmentModal';
import { Plus, Sparkles, LayoutPanelLeft, Clock, LocateFixed, Edit3, Settings, Share2, ShieldAlert, FileSpreadsheet, FileText, Menu, X as CloseIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const STORAGE_KEY = 'social_celebration_gantt_data';

const INITIAL_DEPARTMENTS: Department[] = [
  { id: 'dept-head', name: '總召' },
  { id: 'dept-act', name: '活動組' },
  { id: 'dept-pr', name: '公關組' },
  { id: 'dept-design', name: '美宣組' },
  { id: 'dept-equip', name: '總器組' },
];

const today = startOfDay(new Date());

const INITIAL_TASKS: Task[] = [];

const EditableHeader: React.FC<{ value: string; onChange: (v: string) => void; className?: string }> = ({ value, onChange, className }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [temp, setTemp] = useState(value);
  if (isEditing) return <input autoFocus className="border-b-2 border-indigo-500 outline-none bg-transparent" value={temp} onChange={e => setTemp(e.target.value)} onBlur={() => { setIsEditing(false); onChange(temp); }} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
  return <div onClick={() => setIsEditing(true)} className={`cursor-pointer group flex items-center gap-2 ${className}`}>{value} <Edit3 size={14} className="opacity-0 group-hover:opacity-50" /></div>;
};

const App: React.FC = () => {
  const [projectTitle, setProjectTitle] = useState('社慶甘特圖');
  const [projectSubtitle, setProjectSubtitle] = useState('各組分工及期程');
  const [departments, setDepartments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [viewMode, setViewMode] = useState<ViewMode>('Day');
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'ai' | 'settings'>('edit');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [summaryDate, setSummaryDate] = useState<Date | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [jumpTrigger, setJumpTrigger] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [deptToEdit, setDeptToEdit] = useState<{ id?: string, name: string } | null>(null);

  const geminiService = useMemo(() => new GeminiService(), []);
  const isAiAvailable = geminiService.isAvailable();

  const loadData = useCallback((data: any) => {
    if (!data) return;
    if (data.projectTitle) setProjectTitle(data.projectTitle);
    if (data.projectSubtitle) setProjectSubtitle(data.projectSubtitle);
    if (data.departments) setDepartments(data.departments);
    if (data.tasks) setTasks(data.tasks.map((t:any) => ({ ...t, startDate: new Date(t.startDate), endDate: new Date(t.endDate) })));
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        loadData(JSON.parse(saved));
      } catch(e) {
        console.error("Failed to load saved data", e);
      }
    }
  }, [loadData]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projectTitle, projectSubtitle, departments, tasks }));
  }, [projectTitle, projectSubtitle, departments, tasks]);

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(tasks.map(t => ({ '任務': t.name, '組別': departments.find(d => d.id === t.departmentId)?.name, '開始': formatDate(t.startDate), '結束': formatDate(t.endDate), '進度': `${t.progress}%` })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Tasks"); XLSX.writeFile(wb, `${projectTitle}.xlsx`);
  };

  const handleAiSuggest = async () => {
    if (!aiInput.trim() || !isAiAvailable) return;
    setIsAiLoading(true);
    try {
      const suggestions = await geminiService.parseTaskInput(aiInput, formatDate(new Date()));
      const newTasks = suggestions.map((s: any) => ({ id: Math.random().toString(36).substr(2,9), name: s.name, startDate: addDays(today, s.offsetFromBase), endDate: addDays(today, s.offsetFromBase + s.durationDays), color: s.color || '#6366f1', progress: 0, departmentId: departments[0].id }));
      setTasks(prev => [...prev, ...newTasks]); setAiInput(''); setActiveTab('edit'); setIsSidebarOpen(false);
    } catch (e) { alert("AI 解析失敗"); } finally { setIsAiLoading(false); }
  };

  return (
    <div className="flex flex-col h-screen bg-white" onClick={() => setSelectedTaskId(null)}>
      <header className="border-b px-4 py-3 flex items-center justify-between z-50 bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 hover:bg-slate-100 rounded-lg"><Menu size={20}/></button>
          <div className="hidden sm:block bg-indigo-600 p-2 rounded-lg text-white"><LayoutPanelLeft size={20}/></div>
          <div>
            <EditableHeader value={projectTitle} onChange={setProjectTitle} className="text-lg font-bold text-slate-800" />
            <div className="hidden sm:block text-[10px] text-slate-400 font-bold uppercase tracking-widest">{projectSubtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setJumpTrigger(p => p+1)} className="p-2 bg-slate-100 rounded-lg text-indigo-600 hover:bg-slate-200 transition-colors"><LocateFixed size={18}/></button>
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {(['Day', 'Week', 'Month'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1.5 rounded-lg transition-all ${viewMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>{m === 'Day' ? '日' : m === 'Week' ? '週' : '月'}</button>
            ))}
          </div>
          <button onClick={() => setEditingTask({ id: Math.random().toString(36).substr(2,9), name: '新任務', startDate: today, endDate: addDays(today, 3), color: '#94a3b8', progress: 0, departmentId: departments[0]?.id || '' })} className="hidden sm:flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"><Plus size={18}/>新增</button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        <aside className={`fixed md:relative inset-y-0 left-0 w-80 bg-white border-r flex flex-col z-[60] transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className="flex border-b text-[10px] font-black uppercase tracking-widest text-slate-400">
            {['edit', 'ai', 'settings'].map(t => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-4 border-b-2 transition-colors ${activeTab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent'}`}>{t === 'edit' ? '任務清單' : t === 'ai' ? 'AI 排程' : '設定'}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/20">
            {activeTab === 'edit' ? (
              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <div className="text-center py-20 text-slate-300">
                    <Clock size={24} className="mx-auto mb-2" />
                    <p className="text-xs font-bold">目前無任務</p>
                  </div>
                ) : (
                  tasks.map(t => (
                    <div key={t.id} onClick={(e) => { e.stopPropagation(); setSelectedTaskId(t.id); }} onDoubleClick={() => setEditingTask(t)} className={`p-4 bg-white border-2 rounded-xl cursor-pointer transition-all ${selectedTaskId === t.id ? 'border-indigo-500 shadow-lg shadow-indigo-50' : 'border-slate-100 hover:border-indigo-200'}`}>
                      <div className="flex justify-between items-start mb-2"><span className="font-bold text-sm truncate pr-2">{t.name}</span><div className="w-3 h-3 rounded-full" style={{backgroundColor: t.color}}/></div>
                      <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1"><Clock size={10}/> {formatDate(t.startDate)} ~ {formatDate(t.endDate)}</div>
                    </div>
                  ))
                )}
              </div>
            ) : activeTab === 'ai' ? (
              <div className="space-y-4">
                {isAiAvailable ? (
                  <>
                    <textarea value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder="描述您的活動規劃，AI 將自動生成排程..." className="w-full h-40 p-4 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                    <button disabled={isAiLoading || !aiInput.trim()} onClick={handleAiSuggest} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex justify-center items-center gap-2">{isAiLoading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"/> : <><Sparkles size={16}/>智能生成</>}</button>
                  </>
                ) : <div className="text-center py-10 opacity-50"><ShieldAlert className="mx-auto mb-2"/><p className="text-xs">AI 密鑰未配置，此功能已禁用</p></div>}
              </div>
            ) : (
              <div className="space-y-3">
                <button onClick={handleExportExcel} className="w-full p-3 bg-white border rounded-xl flex items-center gap-3 text-sm font-bold hover:bg-slate-50 transition-colors"><FileSpreadsheet size={16} className="text-emerald-500"/>匯出 Excel</button>
                <button onClick={() => { if(confirm('重置將刪除所有任務！')) { setTasks([]); } }} className="w-full p-3 text-rose-500 text-xs font-bold mt-10">清空所有工項資料</button>
              </div>
            )}
          </div>
        </aside>

        {isSidebarOpen && <div className="md:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-50" onClick={() => setIsSidebarOpen(false)} />}

        <div className="flex-1 overflow-hidden relative">
          <GanttChart
            tasks={tasks} departments={departments} viewMode={viewMode}
            onUpdateTask={t => setTasks(prev => prev.map(p => p.id === t.id ? t : p))}
            onTaskClick={t => setSelectedTaskId(t.id)} onTaskDoubleClick={t => setEditingTask(t)}
            onDateClick={d => setSummaryDate(d)} isDelayed={() => false}
            onAddDepartment={() => setDeptToEdit({ name: '' })}
            onUpdateDepartment={id => { const d = departments.find(dep => dep.id === id); if(d) setDeptToEdit(d); }}
            onDeleteDepartment={id => setDepartments(p => p.filter(d => d.id !== id))}
            onReorderDepartments={(s, e) => { const r = Array.from(departments); const [rem] = r.splice(s, 1); r.splice(e, 0, rem); setDepartments(r); }}
            jumpToTodayTrigger={jumpTrigger} selectedTaskId={selectedTaskId}
          />
          <button onClick={() => setEditingTask({ id: Math.random().toString(36).substr(2,9), name: '新任務', startDate: today, endDate: addDays(today, 3), color: '#94a3b8', progress: 0, departmentId: departments[0]?.id || '' })} className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center z-40 active:scale-90 transition-transform"><Plus size={24}/></button>
        </div>
      </main>

      {editingTask && <TaskModal task={editingTask} allTasks={tasks.filter(t=>t.id!==editingTask.id)} departments={departments} onClose={() => setEditingTask(null)} onSave={t => { setTasks(prev => prev.some(p=>p.id===t.id) ? prev.map(p=>p.id===t.id?t:p) : [...prev, t]); setEditingTask(null); }} onDelete={id => { setTasks(p=>p.filter(t=>t.id!==id)); setEditingTask(null); }} isDelayed={false} />}
      {summaryDate && <DateSummaryModal date={summaryDate} tasks={tasks} onClose={() => setSummaryDate(null)} onTaskClick={t => { setSummaryDate(null); setEditingTask(t); }} />}
      {deptToEdit && <DepartmentModal initialName={deptToEdit.name} mode={deptToEdit.id ? 'edit' : 'add'} onClose={() => setDeptToEdit(null)} onSave={n => { if(deptToEdit.id) setDepartments(p=>p.map(d=>d.id===deptToEdit.id?{...d, name:n}:d)); else setDepartments(p=>[...p, {id:`dept-${Date.now()}`, name:n}]); setDeptToEdit(null); }} />}
    </div>
  );
};

export default App;

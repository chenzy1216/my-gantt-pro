
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Task, ViewMode, Department } from './types';
import { addDays, startOfDay, formatDate } from './utils/dateUtils';
import { GeminiService } from './services/geminiService';
import GanttChart from './components/GanttChart';
import TaskModal from './components/TaskModal';
import DateSummaryModal from './components/DateSummaryModal';
import DepartmentModal from './components/DepartmentModal';
import { Plus, Sparkles, LayoutPanelLeft, AlertCircle, Clock, LocateFixed, Edit3, Settings, Download, Upload, Share2, Trash2, CheckCircle, Link, Copy, ShieldAlert, FileSpreadsheet, FileText, Menu, X as CloseIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const STORAGE_KEY = 'gemini_gantt_data';

const INITIAL_DEPARTMENTS: Department[] = [
  { id: 'dept-1', name: '開發部' },
  { id: 'dept-2', name: '設計部' },
  { id: 'dept-3', name: '維運部' },
];

const INITIAL_TASKS: Task[] = [
  {
    id: '1',
    name: '需求分析 & 規劃',
    startDate: startOfDay(new Date()),
    endDate: addDays(startOfDay(new Date()), 5),
    color: '#6366f1',
    progress: 80,
    notes: '初步客戶訪談已完成，待確認預算細節。',
    departmentId: 'dept-1',
    relatedTaskIds: ['3']
  }
];

const EditableHeader: React.FC<{
  value: string;
  onChange: (val: string) => void;
  className?: string;
  inputClassName?: string;
}> = ({ value, onChange, className, inputClassName }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (tempValue.trim()) onChange(tempValue.trim());
    else setTempValue(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBlur();
    if (e.key === 'Escape') {
      setTempValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`bg-slate-100 outline-none border-b-2 border-indigo-500 rounded px-1 ${inputClassName}`}
      />
    );
  }

  return (
    <div 
      onClick={() => setIsEditing(true)}
      className={`group cursor-pointer flex items-center gap-2 hover:bg-slate-50 px-1 rounded transition-colors ${className}`}
    >
      <span className="truncate">{value}</span>
      <Edit3 size={12} className="opacity-0 group-hover:opacity-40 transition-opacity text-indigo-600 flex-shrink-0" />
    </div>
  );
};

const App: React.FC = () => {
  const [projectTitle, setProjectTitle] = useState('Gemini Gantt Master');
  const [projectSubtitle, setProjectSubtitle] = useState('Departmental Schedule');
  const [departments, setDepartments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [viewMode, setViewMode] = useState<ViewMode>('Day');
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'ai' | 'settings'>('edit');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [summaryDate, setSummaryDate] = useState<Date | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [jumpToTodayTrigger, setJumpToTodayTrigger] = useState(0);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [showSharedToast, setShowSharedToast] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [deptToEdit, setDeptToEdit] = useState<{ id?: string, name: string } | null>(null);

  const geminiService = useMemo(() => new GeminiService(), []);

  const encodeData = (data: any) => {
    try {
      const jsonStr = JSON.stringify(data);
      return btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
    } catch (e) {
      console.error("Encoding failed", e);
      return "";
    }
  };

  const decodeData = (encoded: string) => {
    try {
      const binStr = atob(encoded);
      const decodedUri = Array.from(binStr).map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('');
      return JSON.parse(decodeURIComponent(decodedUri));
    } catch (e) {
      console.error("Decoding failed", e);
      return null;
    }
  };

  const loadProjectData = useCallback((data: any) => {
    if (!data) return;
    try {
      if (data.projectTitle) setProjectTitle(data.projectTitle);
      if (data.projectSubtitle) setProjectSubtitle(data.projectSubtitle);
      if (data.departments && Array.isArray(data.departments)) setDepartments(data.departments);
      if (data.tasks && Array.isArray(data.tasks)) {
        setTasks(data.tasks.map((t: any) => ({
          ...t,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate)
        })));
      }
    } catch (err) {
      console.error("Error applying project data", err);
    }
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const queryData = urlParams.get('data');
    if (queryData) {
      const decoded = decodeData(queryData);
      if (decoded) {
        loadProjectData(decoded);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } else {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          loadProjectData(JSON.parse(saved));
        } catch (e) { console.error("LocalStorage load error", e); }
      }
    }
  }, [loadProjectData]);

  useEffect(() => {
    const dataToSave = {
      projectTitle,
      projectSubtitle,
      departments,
      tasks: tasks.map(t => ({
        ...t,
        startDate: t.startDate.toISOString(),
        endDate: t.endDate.toISOString()
      }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    setShowSavedToast(true);
    const timer = setTimeout(() => setShowSavedToast(false), 2000);
    return () => clearTimeout(timer);
  }, [projectTitle, projectSubtitle, departments, tasks]);

  const handleShareLink = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentData = { projectTitle, projectSubtitle, departments, tasks: tasks.map(t => ({ ...t, startDate: t.startDate.toISOString(), endDate: t.endDate.toISOString() })) };
    const encoded = encodeData(currentData);
    if (!encoded) return;
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    const url = `${baseUrl}?data=${encoded}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setShowSharedToast(true);
        setTimeout(() => setShowSharedToast(false), 3000);
      }).catch(() => window.prompt("分享連結：", url));
    } else {
      window.prompt("分享連結：", url);
    }
  };

  const handleExportExcel = () => {
    const exportData = tasks.map(task => ({ '工項名稱': task.name, '部門': departments.find(d => d.id === task.departmentId)?.name || '未分類', '開始日期': formatDate(task.startDate), '結束日期': formatDate(task.endDate), '進度 (%)': task.progress, '備註': task.notes || '' }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tasks");
    XLSX.writeFile(wb, `${projectTitle}_Backup.xlsx`);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF();
    const tableData = tasks.map(task => [task.name, departments.find(d => d.id === task.departmentId)?.name || 'None', formatDate(task.startDate), formatDate(task.endDate), `${task.progress}%`]);
    doc.setFontSize(18); doc.text(projectTitle, 14, 22);
    (doc as any).autoTable({ startY: 30, head: [['Task Name', 'Department', 'Start', 'End', 'Progress']], body: tableData });
    doc.save(`${projectTitle}_Report.pdf`);
  };

  const handleExport = () => {
    const data = localStorage.getItem(STORAGE_KEY); if (!data) return;
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${projectTitle}.json`; link.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => { try { loadProjectData(JSON.parse(event.target?.result as string)); alert('匯入成功！'); } catch (e) { alert('匯入失敗'); } };
    reader.readAsText(file);
  };

  const handleReset = () => { if (confirm('確定要清空所有資料嗎？')) { setTasks([]); setDepartments(INITIAL_DEPARTMENTS); } };

  const isDelayed = (task: Task) => { const today = startOfDay(new Date()); return task.endDate < today && task.progress < 100; };

  const handleAddTask = useCallback(() => {
    const defaultDept = departments[0]?.id || 'dept-1';
    const newTask: Task = { id: Math.random().toString(36).substr(2, 9), name: '新工項', startDate: startOfDay(new Date()), endDate: addDays(startOfDay(new Date()), 3), color: '#94a3b8', progress: 0, notes: '', departmentId: defaultDept, relatedTaskIds: [] };
    setTasks(prev => [...prev, newTask]);
    setEditingTask(newTask);
  }, [departments]);

  const handleUpdateTask = useCallback((updatedTask: Task) => { setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t)); setEditingTask(null); }, []);
  const handleDeleteTask = useCallback((id: string) => { setTasks(prev => prev.filter(t => t.id !== id)); setEditingTask(null); if (selectedTaskId === id) setSelectedTaskId(null); }, [selectedTaskId]);

  const handleSaveDepartment = (name: string) => {
    if (deptToEdit?.id) {
      setDepartments(prev => prev.map(d => d.id === deptToEdit.id ? { ...d, name } : d));
    } else {
      setDepartments(prev => [...prev, { id: `dept-${Math.random().toString(36).substr(2, 9)}`, name }]);
    }
    setDeptToEdit(null);
  };

  const handleReorderDepartments = (startIndex: number, endIndex: number) => {
    setDepartments(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  };

  const handleAiSuggest = async () => {
    if (!aiInput.trim() || !geminiService.isAvailable()) return;
    setIsAiLoading(true);
    try {
      const suggestions = await geminiService.parseTaskInput(aiInput, formatDate(new Date()));
      const newTasks: Task[] = suggestions.map((s: any) => ({ id: Math.random().toString(36).substr(2, 9), name: s.name, startDate: addDays(startOfDay(new Date()), s.offsetFromBase), endDate: addDays(startOfDay(new Date()), s.offsetFromBase + s.durationDays), color: s.color || '#6366f1', progress: s.progress || 0, notes: `由 AI 生成`, departmentId: departments[0]?.id || 'dept-1', relatedTaskIds: [] }));
      setTasks(prev => [...prev, ...newTasks]); setAiInput(''); setActiveTab('edit');
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    } catch (error) { alert("AI 處理失敗"); } finally { setIsAiLoading(false); }
  };

  const isAiAvailable = geminiService.isAvailable();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white" onClick={() => setSelectedTaskId(null)}>
      {/* Header */}
      <header className="bg-white border-b px-4 md:px-6 py-3 flex items-center justify-between shadow-sm z-50">
        <div className="flex items-center gap-2 md:gap-3">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-600"
          >
            <Menu size={20} />
          </button>
          <div className="hidden sm:flex bg-indigo-600 p-1.5 md:p-2 rounded-lg shadow-md shadow-indigo-100">
            <LayoutPanelLeft className="text-white w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div className="relative max-w-[150px] sm:max-w-none">
            <EditableHeader 
              value={projectTitle} 
              onChange={setProjectTitle}
              className="text-base md:text-xl font-bold text-slate-800 tracking-tight"
            />
            <div className="hidden sm:block">
              <EditableHeader 
                value={projectSubtitle} 
                onChange={setProjectSubtitle}
                className="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-0.5"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 relative">
          <button
            onClick={() => setJumpToTodayTrigger(prev => prev + 1)}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 md:px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all border border-slate-200"
          >
            <LocateFixed size={14} className="text-indigo-600" />
            <span className="hidden sm:inline">今日</span>
          </button>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            {(['Day', 'Week', 'Month'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 md:px-4 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all ${
                  viewMode === mode ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {mode === 'Day' ? '日' : mode === 'Week' ? '週' : '月'}
              </button>
            ))}
          </div>

          <button
            onClick={handleAddTask}
            className="hidden sm:flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-200 active:scale-95"
          >
            <Plus size={18} strokeWidth={3} />
            <span>新增</span>
          </button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <aside className={`
          fixed md:relative inset-y-0 left-0 w-80 bg-white border-r flex flex-col shadow-2xl md:shadow-none z-[60] transition-transform duration-300
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `} onClick={(e) => e.stopPropagation()}>
          <div className="flex border-b">
            {(['edit', 'ai', 'settings'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors flex items-center justify-center gap-2 ${
                  activeTab === tab ? 'border-indigo-600 text-indigo-600 bg-indigo-50/10' : 'border-transparent text-slate-400'
                }`}
              >
                {tab === 'edit' ? '清單' : tab === 'ai' ? 'AI' : <Settings size={14} />}
              </button>
            ))}
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden px-4 text-slate-400"
            >
              <CloseIcon size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30">
            {activeTab === 'edit' ? (
              <div className="space-y-3 pb-20">
                {tasks.length === 0 ? (
                  <div className="text-center py-20 text-slate-300"><Clock size={24} className="mx-auto mb-2" /><p className="text-xs font-bold">無工項</p></div>
                ) : (
                  tasks.map(task => (
                    <div
                      key={task.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedTaskId(task.id === selectedTaskId ? null : task.id); }}
                      onDoubleClick={(e) => { e.stopPropagation(); setEditingTask(task); }}
                      className={`p-4 rounded-xl border-2 bg-white transition-all cursor-pointer ${selectedTaskId === task.id ? 'border-indigo-500 ring-2 ring-indigo-50' : 'border-slate-100 hover:border-indigo-200'}`}
                    >
                      <div className="flex items-start justify-between">
                        <h3 className="font-bold text-sm text-slate-800">{task.name}</h3>
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: task.color }} />
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold mt-2 flex items-center gap-1">
                        <Clock size={10} /> {formatDate(task.startDate)} - {formatDate(task.endDate)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : activeTab === 'ai' ? (
              <div className="space-y-4">
                {isAiAvailable ? (
                  <>
                    <textarea
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder="例如：安排一個為期兩週的行銷活動規劃..."
                      className="w-full h-56 p-4 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    />
                    <button
                      disabled={isAiLoading || !aiInput.trim()}
                      onClick={handleAiSuggest}
                      className="w-full bg-slate-900 text-white py-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg"
                    >
                      {isAiLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Sparkles size={16} /><span>智能生成</span></>}
                    </button>
                  </>
                ) : <div className="text-center py-10"><ShieldAlert size={24} className="mx-auto text-slate-400 mb-2" /><p className="text-xs text-slate-500">AI 功能目前不可用</p></div>}
              </div>
            ) : (
              <div className="space-y-4">
                <button onClick={handleShareLink} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200 text-sm font-bold"><Share2 size={16} />複製分享連結</button>
                <button onClick={handleExportExcel} className="w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-bold"><FileSpreadsheet size={16} />Excel 導出</button>
                <button onClick={handleExportPdf} className="w-full flex items-center gap-3 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm font-bold"><FileText size={16} />PDF 導出</button>
                <div className="pt-4 border-t"><button onClick={handleReset} className="w-full text-rose-500 text-xs font-bold py-2">清空所有資料</button></div>
              </div>
            )}
          </div>
        </aside>

        {/* Overlay for mobile sidebar */}
        {isSidebarOpen && (
          <div 
            className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 animate-in fade-in"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Gantt Chart Content */}
        <div className="flex-1 overflow-hidden relative">
          <GanttChart
            tasks={tasks}
            departments={departments}
            viewMode={viewMode}
            onUpdateTask={(updatedTask) => setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t))}
            onTaskClick={(task) => setSelectedTaskId(task.id === selectedTaskId ? null : task.id)}
            onTaskDoubleClick={(task) => setEditingTask(task)}
            onDateClick={(date) => setSummaryDate(date)}
            isDelayed={isDelayed}
            onAddDepartment={() => setDeptToEdit({ name: '' })}
            onUpdateDepartment={(id) => { const d = departments.find(dep => dep.id === id); if (d) setDeptToEdit({ id: d.id, name: d.name }); }}
            onDeleteDepartment={(id) => setDepartments(prev => prev.filter(d => d.id !== id))}
            onReorderDepartments={handleReorderDepartments}
            jumpToTodayTrigger={jumpToTodayTrigger}
            selectedTaskId={selectedTaskId}
          />

          {/* Mobile FAB */}
          <button
            onClick={handleAddTask}
            className="sm:hidden fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center z-40 active:scale-90 transition-transform"
          >
            <Plus size={28} strokeWidth={3} />
          </button>
        </div>
      </main>

      {/* Modals */}
      {editingTask && <TaskModal task={editingTask} allTasks={tasks.filter(t => t.id !== editingTask.id)} departments={departments} onClose={() => setEditingTask(null)} onSave={handleUpdateTask} onDelete={handleDeleteTask} isDelayed={isDelayed(editingTask)} />}
      {summaryDate && <DateSummaryModal date={summaryDate} tasks={tasks} onClose={() => setSummaryDate(null)} onTaskClick={(task) => { setSummaryDate(null); setEditingTask(task); }} />}
      {deptToEdit && <DepartmentModal initialName={deptToEdit.name} mode={deptToEdit.id ? 'edit' : 'add'} onClose={() => setDeptToEdit(null)} onSave={handleSaveDepartment} />}
    </div>
  );
};

export default App;

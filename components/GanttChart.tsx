
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Task, ViewMode, DragState, Department } from '../types';
import { addDays, differenceInDays, getDatesInRange, startOfDay, formatDate } from '../utils/dateUtils';
import TaskBar from './TaskBar';
import { Plus, Edit2, Trash2, GripVertical } from 'lucide-react';

interface GanttChartProps {
  tasks: Task[];
  departments: Department[];
  viewMode: ViewMode;
  onUpdateTask: (task: Task) => void;
  onTaskClick: (task: Task) => void;
  onTaskDoubleClick: (task: Task) => void;
  onDateClick: (date: Date) => void;
  isDelayed: (task: Task) => boolean;
  onAddDepartment: () => void;
  onUpdateDepartment: (id: string) => void;
  onDeleteDepartment: (id: string) => void;
  onReorderDepartments: (startIndex: number, endIndex: number) => void;
  jumpToTodayTrigger: number;
  selectedTaskId: string | null;
}

const ROW_HEIGHT = 60;
const HEADER_HEIGHT = 70;

const GanttChart: React.FC<GanttChartProps> = ({ 
  tasks, departments, viewMode, onUpdateTask, onTaskClick, onTaskDoubleClick, onDateClick, isDelayed,
  onAddDepartment, onUpdateDepartment, onDeleteDepartment, onReorderDepartments,
  jumpToTodayTrigger, selectedTaskId
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [draggedDeptIndex, setDraggedDeptIndex] = useState<number | null>(null);
  const [dragOverDeptIndex, setDragOverDeptIndex] = useState<number | null>(null);

  // 根據螢幕寬度調整左側欄位
  const [deptColumnWidth, setDeptColumnWidth] = useState(window.innerWidth < 768 ? 120 : 180);

  useEffect(() => {
    const handleResize = () => setDeptColumnWidth(window.innerWidth < 768 ? 120 : 180);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [taskDragPreview, setTaskDragPreview] = useState<{
    taskId: string;
    newStart: Date;
    newEnd: Date;
  } | null>(null);

  const dayWidth = useMemo(() => {
    switch (viewMode) {
      case 'Week': return 20;
      case 'Month': return 8;
      default: return window.innerWidth < 768 ? 50 : 60;
    }
  }, [viewMode]);

  const timelineDates = useMemo(() => {
    if (tasks.length === 0) {
      const today = startOfDay(new Date());
      return getDatesInRange(addDays(today, -7), addDays(today, 60));
    }
    const starts = tasks.map(t => t.startDate.getTime());
    const ends = tasks.map(t => t.endDate.getTime());
    const minDate = new Date(Math.min(...starts));
    const maxDate = new Date(Math.max(...ends));
    
    const buffer = viewMode === 'Month' ? 90 : 30;
    return getDatesInRange(addDays(minDate, -buffer), addDays(maxDate, buffer));
  }, [tasks, viewMode]);

  const startDate = timelineDates[0];
  const totalWidth = timelineDates.length * dayWidth;

  const handleMouseDown = (e: React.MouseEvent, taskId: string, type: DragState['type']) => {
    e.stopPropagation();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    setDragState({ taskId, type, startX: e.clientX, originalStart: new Date(task.startDate), originalEnd: new Date(task.endDate) });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return;
    const deltaX = e.clientX - dragState.startX;
    const deltaDays = Math.round(deltaX / dayWidth);
    let newStart = new Date(dragState.originalStart);
    let newEnd = new Date(dragState.originalEnd);

    if (dragState.type === 'move') {
      newStart = addDays(dragState.originalStart, deltaDays);
      newEnd = addDays(dragState.originalEnd, deltaDays);
    } else if (dragState.type === 'resize-start') {
      newStart = addDays(dragState.originalStart, deltaDays);
      if (differenceInDays(newEnd, newStart) < 1) newStart = addDays(newEnd, -1);
    } else if (dragState.type === 'resize-end') {
      newEnd = addDays(dragState.originalEnd, deltaDays);
      if (differenceInDays(newEnd, newStart) < 1) newEnd = addDays(newStart, 1);
    }
    setTaskDragPreview({ taskId: dragState.taskId, newStart, newEnd });
  }, [dragState, dayWidth]);

  const handleMouseUp = useCallback(() => {
    if (dragState && taskDragPreview) {
      const task = tasks.find(t => t.id === dragState.taskId);
      if (task) onUpdateTask({ ...task, startDate: taskDragPreview.newStart, endDate: taskDragPreview.newEnd });
    }
    setDragState(null);
    setTaskDragPreview(null);
  }, [dragState, taskDragPreview, tasks, onUpdateTask]);

  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [dragState, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (jumpToTodayTrigger > 0 && containerRef.current) {
      const today = startOfDay(new Date());
      const offsetDays = differenceInDays(today, startDate);
      const scrollLeft = offsetDays * dayWidth;
      const viewportWidth = containerRef.current.clientWidth - deptColumnWidth;
      containerRef.current.scrollTo({ left: Math.max(0, scrollLeft - (viewportWidth / 2)), behavior: 'smooth' });
    }
  }, [jumpToTodayTrigger, startDate, dayWidth, deptColumnWidth]);

  const deptData = useMemo(() => {
    let currentY = 0;
    return departments.map((dept, index) => {
      const deptTasks = tasks.filter(t => t.departmentId === dept.id);
      const startY = currentY;
      const height = Math.max(deptTasks.length, 1) * ROW_HEIGHT;
      currentY += height;
      return { ...dept, startY, height, deptTasks, index };
    });
  }, [departments, tasks]);

  const totalHeight = deptData.reduce((acc, d) => acc + d.height, 0);
  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId), [tasks, selectedTaskId]);
  const relatedIds = useMemo(() => selectedTask?.relatedTaskIds || [], [selectedTask]);

  return (
    <div className="w-full h-full overflow-auto bg-white select-none flex scroll-smooth" ref={containerRef}>
      
      {/* Departments Column */}
      <div className="sticky left-0 z-40 bg-white border-r flex flex-col flex-shrink-0" style={{ width: deptColumnWidth }}>
        <div className="bg-slate-50 border-b flex items-center px-2 md:px-4 justify-between flex-shrink-0" style={{ height: HEADER_HEIGHT }}>
          <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">部門分組</span>
          <button onClick={onAddDepartment} className="p-1.5 md:p-2 hover:bg-indigo-600 hover:text-white rounded-lg text-indigo-600 transition-colors border border-indigo-100 flex-shrink-0">
            {/* Fix: Removed non-existent md:size prop from Lucide icon */}
            <Plus size={18} strokeWidth={3} />
          </button>
        </div>

        <div className="flex-1">
          {deptData.map((dept, idx) => (
            <div 
              key={dept.id} 
              className="border-b bg-white group hover:bg-slate-50 relative flex flex-col justify-center px-2 md:px-4"
              style={{ height: dept.height }}
            >
              <div className="flex items-center justify-between gap-1 overflow-hidden">
                <span className="text-xs md:text-sm font-bold text-slate-700 truncate">{dept.name}</span>
                <div className="flex gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                   <button onClick={() => onUpdateDepartment(dept.id)} className="p-1 hover:text-indigo-600 transition-colors"><Edit2 size={12} /></button>
                </div>
              </div>
              <span className="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-tighter mt-0.5">
                {dept.deptTasks.length} 個
              </span>
            </div>
          ))}
          <div className="bg-slate-50/20" style={{ height: 100 }} />
        </div>
      </div>

      {/* Gantt Timeline */}
      <div className="relative flex-shrink-0" style={{ width: totalWidth }}>
        
        {/* Dates Header */}
        <div className="sticky top-0 z-30 flex bg-white/95 backdrop-blur border-b" style={{ height: HEADER_HEIGHT }}>
          {timelineDates.map((date, i) => {
            const isToday = formatDate(date) === formatDate(new Date());
            const weekend = date.getDay() === 0 || date.getDay() === 6;
            const isFirstOfMonth = date.getDate() === 1;

            return (
              <div
                key={i}
                onClick={() => onDateClick(date)}
                className={`flex-shrink-0 flex flex-col items-center justify-center border-r text-[9px] font-mono cursor-pointer hover:bg-indigo-50/50 ${weekend ? 'bg-slate-50/30' : ''}`}
                style={{ width: dayWidth }}
              >
                <span className="text-slate-400 text-[7px] md:text-[9px] uppercase tracking-tighter">
                  {date.toLocaleDateString('zh-TW', { weekday: 'short' }).charAt(0)}
                </span>
                <span className={`text-[10px] md:text-xs font-black mt-1 ${isToday ? 'bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-sm' : 'text-slate-700'}`}>
                  {date.getDate()}
                </span>
                {isFirstOfMonth && <span className="text-[7px] text-indigo-500 font-black mt-0.5">{date.getMonth() + 1}月</span>}
              </div>
            );
          })}
        </div>

        {/* Grid & Bars */}
        {/* Fix: Replaced Math.max with CSS max() string to correctly incorporate 'calc(100vh - 70px)' */}
        <div className="relative bg-white" style={{ height: `max(${totalHeight + 100}px, calc(100vh - 70px))` }}>
          <div className="absolute inset-0 flex pointer-events-none">
            {timelineDates.map((date, i) => (
              <div
                key={i}
                className={`flex-shrink-0 border-r ${date.getDay() === 0 || date.getDay() === 6 ? 'bg-slate-50/20' : 'border-slate-50'}`}
                style={{ width: dayWidth }}
              />
            ))}
          </div>

          <div 
            className="absolute top-0 bottom-0 border-l-2 border-rose-400/50 z-20 pointer-events-none"
            style={{ left: differenceInDays(startOfDay(new Date()), startDate) * dayWidth }}
          />

          <div className="relative z-10">
            {deptData.map(dept => (
              <React.Fragment key={dept.id}>
                {dept.deptTasks.map((task, localIdx) => {
                  const isDraggingThis = taskDragPreview?.taskId === task.id;
                  const currentStart = isDraggingThis ? taskDragPreview!.newStart : task.startDate;
                  const currentEnd = isDraggingThis ? taskDragPreview!.newEnd : task.endDate;
                  const startOffset = differenceInDays(currentStart, startDate);
                  const duration = Math.max(differenceInDays(currentEnd, currentStart), 1);
                  
                  return (
                    <TaskBar
                      key={task.id}
                      task={{...task, startDate: currentStart, endDate: currentEnd}}
                      x={startOffset * dayWidth}
                      width={duration * dayWidth}
                      top={dept.startY + (localIdx * ROW_HEIGHT)}
                      height={ROW_HEIGHT}
                      onDragStart={handleMouseDown}
                      onClick={() => onTaskClick(task)}
                      onDoubleClick={() => onTaskDoubleClick(task)}
                      isDelayed={isDelayed(task)}
                      isSelected={selectedTaskId === task.id}
                      isRelated={relatedIds.includes(task.id)}
                      isDragging={isDraggingThis}
                      hasAnySelected={!!selectedTaskId}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GanttChart;

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import Papa from 'papaparse';
import { ChevronLeft, ChevronRight, Upload, Settings, Calendar, MapPin, Clock, Info, User } from 'lucide-react';
import './style.css';

const STORAGE_KEY = 'class_schedule_data';
const START_DATE = '2026-03-09'; // 第一周周一的日期
const SLOT_HEIGHT = 45; // 极限压缩高度
const SLOT_GAP = 4;    // 核心间距

// 课程时间表 (完全匹配广东工业大学作息图)
const TIME_SLOTS = [
  { id: 1, label: '1', name: '第1节', start: '08:30', end: '09:15' },
  { id: 2, label: '2', name: '第2节', start: '09:20', end: '10:05' },
  { id: 3, label: '3', name: '第3节', start: '10:25', end: '11:10' },
  { id: 4, label: '4', name: '第4节', start: '11:15', end: '12:00' },
  { id: 5, label: '5', name: '第5节', start: '13:50', end: '14:35' },
  { id: 6, label: '6', name: '第6节', start: '14:40', end: '15:25' },
  { id: 7, label: '7', name: '第7节', start: '15:30', end: '16:15' },
  { id: 8, label: '8', name: '第8节', start: '16:30', end: '17:15' },
  { id: 9, label: '9', name: '第9节', start: '17:20', end: '18:05' },
  { id: 10, label: '10', name: '第10节', start: '18:30', end: '19:15' },
  { id: 11, label: '11', name: '第11节', start: '19:20', end: '20:05' },
  { id: 12, label: '12', name: '第12节', start: '20:10', end: '20:55' },
];

// 顶级设计色盘 - 基于 HSL 的轻盈半透明色系
const MORANDI_COLORS = [
  'hsla(210, 80%, 96%, 0.8)', // 冰蓝
  'hsla(260, 60%, 96%, 0.8)', // 薰衣草
  'hsla(340, 70%, 96%, 0.8)', // 绯粉
  'hsla(20, 80%, 96%, 0.8)',  // 奶油橙
  'hsla(150, 60%, 96%, 0.8)', // 翠露
  'hsla(180, 70%, 96%, 0.8)', // 浅湖
  'hsla(40, 80%, 96%, 0.8)',  // 麦芽
  'hsla(220, 30%, 95%, 0.8)', // 烟霭
  'hsla(280, 50%, 96%, 0.8)', // 丁香
  'hsla(120, 40%, 96%, 0.8)', // 嫩芽
];

// 瑞士排版色彩索引：根据课程名哈希，并确保背景与文字对比度最优化
const getColorByString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return MORANDI_COLORS[Math.abs(hash) % MORANDI_COLORS.length];
};

function App() {
  const [courses, setCourses] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [zoomScale, setZoomScale] = useState(1); // 缩放比例
  const [showWeekPicker, setShowWeekPicker] = useState(false); // 周次跳转选框
  const fileInputRef = useRef(null);
  const gridRef = useRef(null);
  
  // 巧思 5：触摸手势实现左右翻页 (进阶：跟手滑动与回弹效果)
  const [touchOffset, setTouchOffset] = useState(0); // 实时位移偏移量
  const [isAnimating, setIsAnimating] = useState(false); // 是否处于动画过渡中
  const touchStartX = useRef(0);
  const isSingleTouch = useRef(true);

  const handleTouchStart = (e) => {
    if (isAnimating) return; // 动画中禁止操作
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      isSingleTouch.current = true;
      setIsAnimating(false);
    } else {
      isSingleTouch.current = false;
    }
  };

  const handleTouchMove = (e) => {
    if (!isSingleTouch.current || isAnimating) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX.current;
    
    // 增加一点阻尼感（向左划为负值，向右划为正值）
    setTouchOffset(diff);
  };

  const handleTouchEnd = () => {
    if (!isSingleTouch.current || isAnimating) return;
    
    const threshold = window.innerWidth * 0.25; // 25% 屏幕宽度为翻页阈值
    
    setIsAnimating(true);
    
    if (Math.abs(touchOffset) > threshold) {
      // 达到阈值，执行翻页
      const direction = touchOffset > 0 ? -1 : 1; // 1 为下一周，-1 为上一周
      
      // 先滑向边缘
      setTouchOffset(direction === 1 ? -window.innerWidth : window.innerWidth);
      
      // 动画完成后切换周次并重置
      setTimeout(() => {
        if (direction === 1) {
          setCurrentWeek(prev => prev + 1);
        } else {
          setCurrentWeek(prev => Math.max(1, prev - 1));
        }
        setTouchOffset(0);
        setIsAnimating(false);
      }, 300);
    } else {
      // 未达阈!，回弹
      setTouchOffset(0);
      setTimeout(() => setIsAnimating(false), 300);
    }
  };

  // 每 10 秒更新一次时间，让时间线“动”起来
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  // 加载数据并自动计算/定位到当前周
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setCourses(data);
        
        const startDate = new Date(START_DATE);
        const now = new Date();
        const diffWeeks = Math.floor((now - startDate) / (1000 * 60 * 60 * 24 * 7));
        const week = Math.max(1, Math.min(20, diffWeeks + 1));
        setCurrentWeek(week);
      } catch (e) {
        console.error("加载失败", e);
      }
    }
  }, []);

  // 生成特定周的日期列表 (月-日)
  const getWeekDates = (week) => {
    const startDate = new Date(START_DATE);
    startDate.setDate(startDate.getDate() + (week - 1) * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      return `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    });
  };

  // 判断课程是否已经结束
  const isCoursePast = (course, week) => {
    const now = currentTime;
    const startDate = new Date(START_DATE);
    
    // 计算该课程的具体结束时间
    const courseDate = new Date(startDate);
    courseDate.setDate(courseDate.getDate() + (week - 1) * 7 + (course.day - 1));
    
    const lastSection = course.sections[course.sections.length - 1];
    const endTimeStr = TIME_SLOTS.find(t => t.id === lastSection)?.end || "23:59";
    const [h, m] = endTimeStr.split(':');
    
    courseDate.setHours(parseInt(h), parseInt(m), 0);
    
    return now > courseDate;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const processed = results.data.map((item, index) => {
          const sectionStr = item['节次'] || "";
          const sections = [];
          for (let i = 0; i < sectionStr.length; i += 2) {
            const s = parseInt(sectionStr.substring(i, i + 2));
            if (!isNaN(s)) {
              // 注意：如果 CSV 里的 "01" 代表第1节，那么在我们的新 ID 系统中它对应 ID 1
              // 如果有早自习，建议在 CSV 中用 "00" 表示，晚自习用 "11" 表示
              sections.push(s);
            }
          }

          return {
            id: `course-${index}`,
            name: item['课程名称'],
            teacher: item['教师'],
            location: item['上课地点'],
            day: parseInt(item['星期']),
            week: parseInt(item['周次']),
            sections: sections,
            description: item['授课内容简介']
          };
        }).filter(item => item.name && !isNaN(item.day));

        if (processed.length > 0) {
          setCourses(processed);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(processed));
          setShowSettings(false);
        }
      }
    });
  };

  const currentWeekCourses = courses.filter(c => c.week === currentWeek);
  const weekDates = getWeekDates(currentWeek);
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  
  const today = currentTime.getDay();
  const todayIndex = today === 0 ? 7 : today;
  const isSelectedWeekCurrent = currentWeek === Math.max(1, Math.min(20, Math.floor((currentTime - new Date(START_DATE)) / (1000 * 60 * 60 * 24 * 7)) + 1));

  // 巧思 1：动态问候语
  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 9) return "✨ 准备开始新的一天";
    if (hour < 12) return "📖 正在专注学习中";
    if (hour < 14) return "🍲 午休时光";
    if (hour < 18) return "☕ 下午也是元气满满";
    return "🌙 晚安，今日辛苦了";
  };

  // 巧思 2：计算实时红线位置
  const getTimelinePosition = () => {
    if (!isSelectedWeekCurrent) return null;
    
    // 获取实时计算的 CSS 变量，确保与 UI 完全一致
    const slotHeight = SLOT_HEIGHT;
    const slotGap = SLOT_GAP;

    const hour = currentTime.getHours();
    const min = currentTime.getMinutes();
    const timeInMin = hour * 60 + min;

    for (let i = 0; i < TIME_SLOTS.length; i++) {
        const slot = TIME_SLOTS[i];
        const [sh, sm] = slot.start.split(':').map(Number);
        const [eh, em] = slot.end.split(':').map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        
        if (timeInMin >= startMin && timeInMin <= endMin) {
            const progress = (timeInMin - startMin) / (endMin - startMin);
            return (i * (slotHeight + slotGap)) + (progress * slotHeight);
        }
        
        if (i < TIME_SLOTS.length - 1) {
            const nextSlot = TIME_SLOTS[i+1];
            const [nsh, nsm] = nextSlot.start.split(':').map(Number);
            const nextStartMin = nsh * 60 + nsm;
            if (timeInMin > endMin && timeInMin < nextStartMin) {
                return (i * (slotHeight + slotGap)) + slotHeight + (slotGap / 2);
            }
        }
    }
    return null;
  };

  const nowTop = getTimelinePosition();

  // 渲染导入界面 - 奢华质感
  if (courses.length === 0) {
    return (
      <div className="import-screen">
        <div className="import-card">
            <div className="empty-icon-container">
                <Calendar size={40} strokeWidth={1.5} />
            </div>
            <h1 className="import-title">极简课程表</h1>
            <p className="import-desc">完美融合广东工业大学作息，支持移动端高精度对齐。数据在手机本地加密存储。</p>
            <button className="btn-primary" onClick={() => fileInputRef.current.click()} style={{ margin: '0 auto' }}>
                <Upload size={20} />
                <span>立即导入 CSV 文件</span>
            </button>
            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
        </div>
      </div>
    );
  }


  return (
    <div className="app-container">
      <header>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="title">ClassTable</div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>{getGreeting()}</div>
        </div>
        <div className="week-selector">
          <button className="btn-icon" onClick={() => setCurrentWeek(Math.max(1, currentWeek - 1))}>
            <ChevronLeft size={20} />
          </button>
          <button className="week-display-btn" onClick={() => setShowWeekPicker(true)}>
            第 {currentWeek} 周
          </button>
          <button className="btn-icon" onClick={() => setCurrentWeek(currentWeek + 1)}>
            <ChevronRight size={20} />
          </button>
        </div>
        <button className="btn-icon" onClick={() => setShowSettings(true)}>
          <Settings size={22} />
        </button>
      </header>
      
      {/* 巧思 3：缩放控制器 */}
      <div className="zoom-controls">
          <button className="zoom-btn" onClick={() => setZoomScale(s => Math.min(1.5, s + 0.1))} title="放大提升">
              <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>+</span>
          </button>
          <button className="zoom-btn" onClick={() => setZoomScale(s => Math.max(0.4, s - 0.1))} title="缩小平衡">
              <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>-</span>
          </button>
          <button className="zoom-btn" onClick={() => setZoomScale(1)} title="重置核心">
              <Info size={18} />
          </button>
      </div>

      <div className="schedule-scroll" 
           onTouchStart={handleTouchStart} 
           onTouchMove={handleTouchMove} 
           onTouchEnd={handleTouchEnd}
           style={{ overflowX: 'hidden' }}>
        <div className="schedule-grid" 
             ref={gridRef} 
             style={{ 
               '--zoom-scale': zoomScale, 
               '--slot-height': `${SLOT_HEIGHT}px`, 
               '--slot-gap': `${SLOT_GAP}px`,
               transform: `scale(var(--zoom-scale)) translateX(${touchOffset}px)`,
               transition: isAnimating ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
             }}>
          <div className="time-sidebar">
            {TIME_SLOTS.map(slot => (
              <div key={slot.id} className="time-slot">
                <span className="slot-id">{slot.label}</span>
              </div>
            ))}
          </div>
          
          <div style={{ flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 'var(--day-gap)' }}>
              {dayNames.map((day, idx) => (
                <div key={day} 
                     className={`grid-header ${isSelectedWeekCurrent && (idx + 1 === todayIndex) ? 'today' : ''}`} 
                     style={{ 
                         height: 'var(--header-grid-height)', 
                         flexDirection: 'column',
                         display: 'flex'
                     }}>
                  <span className="day-date">{weekDates[idx]}</span>
                  <span className="day-label">{day}</span>
                </div>
              ))}
            </div>
            
            <div className="grid-content">
              {nowTop !== null && (
                <div 
                  className="now-indicator" 
                  style={{ top: `${nowTop}px` }} 
                />
              )}
              
              <div className="columns-container" key={currentWeek}>
                {[1, 2, 3, 4, 5, 6, 7].map(dayNum => (
                  <div key={dayNum} className="day-column">
                    {currentWeekCourses
                      .filter(c => c.day === dayNum)
                      .map(course => {
                        const startSection = course.sections[0];
                        const rowSpan = course.sections.length;
                        const past = isCoursePast(course, currentWeek);
                        const bgColor = getColorByString(course.name);
                        
                        // 获取实时计算的 CSS 变量
                        const slotHeight = SLOT_HEIGHT;
                        const slotGap = SLOT_GAP;
                        
                        // 高精度绝对定位计算 (仅垂直方向)
                        const top = (startSection - 1) * (slotHeight + slotGap);
                        const height = rowSpan * slotHeight + (rowSpan - 1) * slotGap;

                        return (
                          <div 
                            key={course.id}
                            className={`course-card ${past ? 'past' : ''}`}
                            style={{
                              top: `${top}px`,
                              left: 0,
                              width: '100%',
                              height: `${height}px`,
                              backgroundColor: bgColor,
                              borderColor: 'rgba(0,0,0,0.03)',
                            }}
                            onClick={() => setSelectedCourse(course)}
                          >
                            <div className="course-name">{course.name}</div>
                            <div className="course-meta">
                              <div className="course-info">
                                <MapPin size={10} />
                                <span>{course.location}</span>
                              </div>
                              <div className="course-info">
                                <User size={10} />
                                <span>{course.teacher}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 课程详情面板 */}
      <div className={`overlay ${selectedCourse ? 'visible' : ''}`} onClick={() => setSelectedCourse(null)}></div>
      <div className={`drawer ${selectedCourse ? 'open' : ''}`} style={{ bottom: '24px' }}>
        {selectedCourse && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ background: 'var(--primary-light)', padding: '4px 12px', borderRadius: '99px', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>
                课程详情
              </div>
              <button className="btn-icon" onClick={() => setSelectedCourse(null)} style={{ fontSize: '1.5rem' }}>&times;</button>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.5rem', letterSpacing: '-0.02em', color: 'var(--text-main)' }}>{selectedCourse.name}</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="detail-item">
                <div className="detail-icon"><User size={20} /></div>
                <div className="detail-content">
                  <span className="detail-label">主讲教师</span>
                  <span className="detail-value">{selectedCourse.teacher}</span>
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-icon"><MapPin size={20} /></div>
                <div className="detail-content">
                  <span className="detail-label">上课地点</span>
                  <span className="detail-value">{selectedCourse.location}</span>
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-icon"><Clock size={20} /></div>
                <div className="detail-content">
                  <span className="detail-label">上课时间</span>
                  <span className="detail-value">第 {selectedCourse.week} 周 · {dayNames[selectedCourse.day-1]} · {TIME_SLOTS.find(t=>t.id === selectedCourse.sections[0])?.name}</span>
                </div>
              </div>
              {selectedCourse.description && (
                <div className="detail-item">
                  <div className="detail-icon"><Info size={20} /></div>
                  <div className="detail-content">
                    <span className="detail-label">课程简介</span>
                    <p className="detail-desc">{selectedCourse.description}</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 设置面板 */}
      <div className={`overlay ${showSettings ? 'visible' : ''}`} onClick={() => setShowSettings(false)}></div>
      <div className={`drawer ${showSettings ? 'open' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>应用设置</h2>
          <button className="btn-icon" onClick={() => setShowSettings(false)} style={{ fontSize: '1.5rem' }}>&times;</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => fileInputRef.current.click()}>
                <Upload size={20} />
                更新 CSV 课程数据
            </button>
            <div style={{ padding: '12px', background: 'var(--primary-light)', borderRadius: '14px', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>
                💡 提示：移动端支持点击右侧按钮微调显示比例。
            </div>
        </div>
        <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>版本 v1.1.0 · 本地加密存储</p>
        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
      </div>

      {/* 周次快速跳转面板 */}
      <div className={`overlay ${showWeekPicker ? 'visible' : ''}`} onClick={() => setShowWeekPicker(false)}></div>
      <div className={`drawer ${showWeekPicker ? 'open' : ''}`} style={{ maxHeight: '70vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>跳转周次</h2>
          <button className="btn-icon" onClick={() => setShowWeekPicker(false)} style={{ fontSize: '1.5rem' }}>&times;</button>
        </div>
        <div className="week-grid">
          {Array.from({ length: 20 }, (_, i) => i + 1).map(w => (
            <div 
              key={w} 
              className={`week-item ${w === currentWeek ? 'active' : ''}`}
              onClick={() => {
                setCurrentWeek(w);
                setShowWeekPicker(false);
              }}
            >
              {w}
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          点击对应数字快速切换到指定周
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);

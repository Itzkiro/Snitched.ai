'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';

interface Task {
  id: string;
  title: string;
  status: 'done' | 'in-progress' | 'upcoming';
  priority: 'high' | 'medium' | 'low';
  category: string;
  type: 'internal' | 'requested';
  description?: string;
  request?: string;
  completedDate?: string;
}

interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

interface TaskComments {
  taskId: string;
  comments: Comment[];
}

interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  name?: string;
  email?: string;
  timestamp: string;
}

const tasks: Task[] = [
  // DONE
  { id: '1', title: 'Phase 1 Data Ingestion Complete', status: 'done', priority: 'high', category: 'Data', type: 'internal', description: '188 Florida officials (30 federal, 158 state)', request: 'Initial data foundation for platform', completedDate: '2026-02-22' },
  { id: '2', title: 'JFK-Intel Phase 1 Pipeline', status: 'done', priority: 'high', category: 'Data', type: 'internal', description: 'Federal + State data extraction scripts', request: 'Automated data collection from congress-legislators', completedDate: '2026-02-22' },
  { id: '3', title: 'Live/Mock Data Source Tags', status: 'done', priority: 'high', category: 'UI', type: 'internal', description: 'Data source badges on politician cards', request: 'User requested: distinguish real vs demo data', completedDate: '2026-02-22' },
  { id: '4', title: 'Terminal UI Homepage', status: 'done', priority: 'high', category: 'UI', type: 'internal', description: 'DOGE.gov-inspired terminal aesthetic', request: 'Distinctive design to avoid generic AI look', completedDate: '2026-02-22' },
  { id: '5', title: 'DOGE Hierarchy Navigation', status: 'done', priority: 'high', category: 'UI', type: 'internal', description: 'Breadcrumb drill-down structure', request: 'User requested: hierarchy matching DOGE.gov style', completedDate: '2026-02-22' },
  { id: '6', title: 'Juice Box Leaderboard', status: 'done', priority: 'medium', category: 'Features', type: 'internal', description: 'AIPAC funding tracker with tiers', request: 'Track foreign lobby influence on FL politicians', completedDate: '2026-02-22' },
  { id: '7', title: 'Database Browse Page', status: 'done', priority: 'medium', category: 'UI', type: 'internal', description: 'Search + filter UI', request: 'User requested: searchable politician database', completedDate: '2026-02-22' },
  { id: '8', title: 'Volusia County Officials Added', status: 'done', priority: 'medium', category: 'Data', type: 'internal', description: '12 county officials (7 council + 5 constitutional)', request: 'User requested: add all Volusia County politicians', completedDate: '2026-02-22' },
  { id: '9', title: 'Open Graph Social Preview', status: 'done', priority: 'medium', category: 'UI', type: 'internal', description: 'Custom OG image for social sharing', request: 'User provided: custom social media preview image', completedDate: '2026-02-22' },
  { id: '10', title: 'FEC API Integration', status: 'done', priority: 'high', category: 'Data', type: 'internal', description: 'FEC scraper configured and tested', request: 'User provided: FEC API key for campaign finance', completedDate: '2026-02-22' },
  { id: '11', title: 'Research Automation Scripts', status: 'done', priority: 'high', category: 'Data', type: 'internal', description: '4 production scrapers (social, FEC, legal)', request: 'User provided: 5 GitHub repos for OSINT research', completedDate: '2026-02-22' },
  { id: '12', title: 'Federal Photo Download', status: 'done', priority: 'medium', category: 'Data', type: 'internal', description: '30/30 federal photos from theunitedstates.io', request: 'Quick Start photo collection strategy', completedDate: '2026-02-22' },
  
  // IN PROGRESS
  { id: '13', title: 'State Photo Download', status: 'in-progress', priority: 'high', category: 'Data', type: 'internal', description: '158 Florida state legislators from OpenStates YAML', request: 'Complete photo collection for all officials' },
  { id: '14', title: 'Volusia County Research', status: 'in-progress', priority: 'high', category: 'Research', type: 'internal', description: 'OpenPlanter OSINT for 12 county officials', request: 'User requested: research each Volusia politician' },
  { id: '15', title: 'Fix Politician Duplicates', status: 'in-progress', priority: 'high', category: 'Data', type: 'internal', description: 'Deduplicate real data vs mock data entries', request: 'User requested: fix duplicates in database' },
  { id: '16', title: 'Politician Profile iframes', status: 'in-progress', priority: 'medium', category: 'UI', type: 'internal', description: 'Embed external content in dossiers', request: 'User requested: integrate iframes under each politician' },
  
  // UPCOMING
  { id: '17', title: 'Supabase Project Setup', status: 'upcoming', priority: 'high', category: 'Infrastructure', type: 'internal', description: 'PostgreSQL backend for Phase 2 data', request: 'Production database for scraped data storage' },
  { id: '18', title: 'County Photo Collection', status: 'upcoming', priority: 'medium', category: 'Data', type: 'internal', description: '12 Volusia County official photos (manual)', request: 'Complete photo coverage for county officials' },
  { id: '19', title: 'Social Media Scraper Cron', status: 'upcoming', priority: 'high', category: 'Automation', type: 'internal', description: 'Daily automated social post collection', request: 'User provided: social media scraper repos for automation' },
  { id: '20', title: 'AIPAC Detection Pipeline', status: 'upcoming', priority: 'high', category: 'Data', type: 'internal', description: 'Scan FEC contributions for AIPAC PACs', request: 'Identify AIPAC-affiliated PAC contributions automatically' },
  { id: '21', title: 'Corruption Score Algorithm', status: 'upcoming', priority: 'high', category: 'Features', type: 'internal', description: 'Calculate composite risk scores (legal + finance + voting)', request: 'Algorithmic corruption risk assessment (0-100 scale)' },
  { id: '22', title: '66 Remaining Counties', status: 'upcoming', priority: 'medium', category: 'Data', type: 'internal', description: 'Expand beyond Volusia to all FL counties', request: 'Complete Florida county coverage (67 total)' },
  { id: '23', title: 'Interactive Florida Map', status: 'upcoming', priority: 'low', category: 'Features', type: 'internal', description: 'Mapbox visualization of politician locations', request: 'Phase 2: Geographic visualization of corruption data' },
  { id: '24', title: 'Network Graph Visualization', status: 'upcoming', priority: 'low', category: 'Features', type: 'internal', description: 'D3.js connections between politicians/donors', request: 'Phase 2: Visual donor network relationships' },
];

export default function TasksPage() {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['upcoming', 'in-progress', 'done']);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  
  // State for feature requests and comments
  const [allTasks, setAllTasks] = useState<Task[]>(tasks);
  const [taskComments, setTaskComments] = useState<TaskComments[]>([]);
  
  // Feature request form state
  const [requestTitle, setRequestTitle] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [requestName, setRequestName] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  
  // Comment form state
  const [newCommentAuthor, setNewCommentAuthor] = useState('');
  const [newCommentText, setNewCommentText] = useState('');

  // Load data from localStorage on mount
  useEffect(() => {
    const storedComments = localStorage.getItem('snitched-task-comments');
    if (storedComments) {
      setTaskComments(JSON.parse(storedComments));
    }
    
    const storedRequests = localStorage.getItem('snitched-feature-requests');
    if (storedRequests) {
      const requests: FeatureRequest[] = JSON.parse(storedRequests);
      const requestTasks: Task[] = requests.map(req => ({
        id: req.id,
        title: req.title,
        description: req.description,
        status: 'upcoming' as const,
        priority: 'medium' as const,
        category: 'Feature Request',
        type: 'requested' as const,
        request: req.name ? `Requested by ${req.name}` : 'Community request',
      }));
      setAllTasks([...tasks, ...requestTasks]);
    }
  }, []);

  // Save comments to localStorage
  const saveComments = (comments: TaskComments[]) => {
    localStorage.setItem('snitched-task-comments', JSON.stringify(comments));
    setTaskComments(comments);
  };

  // Save feature request
  const saveFeatureRequest = (request: FeatureRequest) => {
    const storedRequests = localStorage.getItem('snitched-feature-requests');
    const requests: FeatureRequest[] = storedRequests ? JSON.parse(storedRequests) : [];
    requests.push(request);
    localStorage.setItem('snitched-feature-requests', JSON.stringify(requests));
    
    // Add to tasks list
    const newTask: Task = {
      id: request.id,
      title: request.title,
      description: request.description,
      status: 'upcoming',
      priority: 'medium',
      category: 'Feature Request',
      type: 'requested',
      request: request.name ? `Requested by ${request.name}` : 'Community request',
    };
    setAllTasks([...allTasks, newTask]);
  };

  // Submit feature request
  const handleSubmitRequest = () => {
    if (!requestTitle.trim() || !requestDescription.trim()) return;
    
    const request: FeatureRequest = {
      id: `req-${Date.now()}`,
      title: requestTitle,
      description: requestDescription,
      name: requestName || undefined,
      email: requestEmail || undefined,
      timestamp: new Date().toISOString(),
    };
    
    saveFeatureRequest(request);
    
    // Reset form
    setRequestTitle('');
    setRequestDescription('');
    setRequestName('');
    setRequestEmail('');
    setShowRequestModal(false);
    
    // Show success message
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  // Submit comment
  const handleSubmitComment = () => {
    if (!selectedTask || !newCommentText.trim()) return;
    
    const comment: Comment = {
      id: `comment-${Date.now()}`,
      author: newCommentAuthor.trim() || 'Anonymous',
      text: newCommentText,
      timestamp: new Date().toISOString(),
    };
    
    const existingTaskComments = taskComments.find(tc => tc.taskId === selectedTask.id);
    if (existingTaskComments) {
      const updatedComments = taskComments.map(tc =>
        tc.taskId === selectedTask.id
          ? { ...tc, comments: [...tc.comments, comment] }
          : tc
      );
      saveComments(updatedComments);
    } else {
      const newTaskComments: TaskComments = {
        taskId: selectedTask.id,
        comments: [comment],
      };
      saveComments([...taskComments, newTaskComments]);
    }
    
    // Reset comment form
    setNewCommentAuthor('');
    setNewCommentText('');
  };

  const upcomingTasks = allTasks.filter(t => t.status === 'upcoming');
  const inProgressTasks = allTasks.filter(t => t.status === 'in-progress');
  const doneTasks = allTasks.filter(t => t.status === 'done');

  const toggleColumn = (column: string) => {
    if (visibleColumns.includes(column)) {
      setVisibleColumns(visibleColumns.filter(c => c !== column));
    } else {
      setVisibleColumns([...visibleColumns, column]);
    }
  };

  const getPriorityColor = (priority: Task['priority']) => {
    if (priority === 'high') return 'var(--terminal-red)';
    if (priority === 'medium') return 'var(--terminal-amber)';
    return 'var(--terminal-text-dim)';
  };

  const getTaskComments = (taskId: string): Comment[] => {
    const tc = taskComments.find(t => t.taskId === taskId);
    return tc ? tc.comments : [];
  };

  const TaskCard = ({ task }: { task: Task }) => (
    <div 
      className="terminal-card" 
      style={{ 
        marginBottom: '1rem',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.2s',
      }}
      onClick={() => setSelectedTask(task)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--terminal-blue)';
        e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 191, 255, 0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--terminal-border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Task Type Badge in Corner */}
      <div style={{
        position: 'absolute',
        top: '0.5rem',
        right: '0.5rem',
        fontSize: '0.5rem',
        padding: '0.2rem 0.4rem',
        background: task.type === 'internal' ? 'rgba(0, 191, 255, 0.2)' : 'rgba(0, 255, 65, 0.2)',
        color: task.type === 'internal' ? 'var(--terminal-blue)' : 'var(--terminal-green)',
        border: `1px solid ${task.type === 'internal' ? 'var(--terminal-blue)' : 'var(--terminal-green)'}`,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {task.type === 'internal' ? '🔧 INTERNAL' : '💡 REQUESTED'}
      </div>

      <div style={{ marginBottom: '0.75rem', paddingTop: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.625rem',
            padding: '0.25rem 0.5rem',
            background: `${getPriorityColor(task.priority)}20`,
            color: getPriorityColor(task.priority),
            border: `1px solid ${getPriorityColor(task.priority)}`,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {task.priority}
          </span>
          <span style={{
            fontSize: '0.625rem',
            padding: '0.25rem 0.5rem',
            background: 'rgba(0, 191, 255, 0.1)',
            color: 'var(--terminal-blue)',
            border: '1px solid var(--terminal-border)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {task.category}
          </span>
        </div>
        <h3 style={{ 
          fontSize: '0.875rem', 
          fontWeight: 700, 
          marginBottom: '0.5rem',
          color: 'var(--terminal-text)',
          lineHeight: 1.3,
        }}>
          {task.title}
        </h3>
        {task.description && (
          <p style={{ 
            fontSize: '0.75rem', 
            color: 'var(--terminal-text-dim)',
            lineHeight: 1.5,
            marginBottom: task.request ? '0.5rem' : 0,
          }}>
            {task.description.length > 100 ? `${task.description.slice(0, 100)}...` : task.description}
          </p>
        )}
        {task.request && (
          <div style={{ 
            fontSize: '0.625rem', 
            color: 'var(--terminal-amber)',
            background: 'rgba(255, 182, 39, 0.1)',
            padding: '0.5rem',
            border: '1px solid rgba(255, 182, 39, 0.2)',
            fontFamily: 'JetBrains Mono, monospace',
            lineHeight: 1.4,
          }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>REQUEST: </span>
            {task.request}
          </div>
        )}
      </div>
      {task.completedDate && (
        <div style={{ 
          fontSize: '0.625rem', 
          color: 'var(--terminal-green)',
          fontFamily: 'JetBrains Mono, monospace',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--terminal-border)',
        }}>
          ✓ {task.completedDate}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--terminal-bg)', color: 'var(--terminal-text)' }}>
      {/* Terminal Title */}
      <div className="terminal-title">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h1>📋 KANBAN BOARD - PROJECT MANAGEMENT</h1>
            <div className="terminal-subtitle">
              Snitched.ai Development Pipeline | {allTasks.length} Total Tasks
            </div>
          </div>
          
          {/* Request Feature Button */}
          <button
            onClick={() => setShowRequestModal(true)}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'var(--terminal-green)',
              border: '2px solid var(--terminal-green)',
              color: '#000',
              fontSize: '0.875rem',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 700,
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 0 20px rgba(0, 255, 65, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--terminal-green)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--terminal-green)';
              e.currentTarget.style.color = '#000';
            }}
          >
            + REQUEST FEATURE
          </button>
        </div>
      </div>

      {/* Success Message */}
      {showSuccessMessage && (
        <div style={{
          position: 'fixed',
          top: '2rem',
          right: '2rem',
          padding: '1rem 1.5rem',
          background: 'var(--terminal-card)',
          border: '2px solid var(--terminal-green)',
          color: 'var(--terminal-green)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.875rem',
          fontWeight: 700,
          zIndex: 10000,
          boxShadow: '0 0 30px rgba(0, 255, 65, 0.3)',
        }}>
          ✓ FEATURE REQUEST SUBMITTED
        </div>
      )}

      {/* Alert */}
      <div style={{ padding: '2rem', borderBottom: '1px solid var(--terminal-border)' }}>
        <div className="alert-level">
          <span className="alert-icon">📊</span>
          <span>PROJECT STATUS: ACTIVE DEVELOPMENT</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--terminal-text-dim)', marginLeft: '1rem' }}>
            Phase 1 Complete | Phase 2 In Progress
          </span>
        </div>
      </div>

      <div style={{ padding: '2rem' }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          {/* Stats Row */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '1.5rem',
            marginBottom: '2rem'
          }}>
            <div className="terminal-card" style={{ 
              background: visibleColumns.includes('upcoming') ? 'var(--terminal-card)' : 'var(--terminal-surface)',
              opacity: visibleColumns.includes('upcoming') ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="stat-value" style={{ color: 'var(--terminal-text-dim)' }}>
                    {upcomingTasks.length}
                  </div>
                  <div className="stat-label">⏳ TO DO</div>
                </div>
                <button
                  onClick={() => toggleColumn('upcoming')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: visibleColumns.includes('upcoming') ? 'var(--terminal-blue)' : 'transparent',
                    border: '1px solid var(--terminal-blue)',
                    color: visibleColumns.includes('upcoming') ? '#000' : 'var(--terminal-blue)',
                    fontSize: '0.75rem',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {visibleColumns.includes('upcoming') ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>

            <div className="terminal-card" style={{ 
              background: visibleColumns.includes('in-progress') ? 'var(--terminal-card)' : 'var(--terminal-surface)',
              opacity: visibleColumns.includes('in-progress') ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="stat-value warning">
                    {inProgressTasks.length}
                  </div>
                  <div className="stat-label">⚙ IN PROGRESS</div>
                </div>
                <button
                  onClick={() => toggleColumn('in-progress')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: visibleColumns.includes('in-progress') ? 'var(--terminal-amber)' : 'transparent',
                    border: '1px solid var(--terminal-amber)',
                    color: visibleColumns.includes('in-progress') ? '#000' : 'var(--terminal-amber)',
                    fontSize: '0.75rem',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {visibleColumns.includes('in-progress') ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>

            <div className="terminal-card" style={{ 
              background: visibleColumns.includes('done') ? 'var(--terminal-card)' : 'var(--terminal-surface)',
              opacity: visibleColumns.includes('done') ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="stat-value" style={{ color: 'var(--terminal-green)' }}>
                    {doneTasks.length}
                  </div>
                  <div className="stat-label">✓ DONE</div>
                </div>
                <button
                  onClick={() => toggleColumn('done')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: visibleColumns.includes('done') ? 'var(--terminal-green)' : 'transparent',
                    border: '1px solid var(--terminal-green)',
                    color: visibleColumns.includes('done') ? '#000' : 'var(--terminal-green)',
                    fontSize: '0.75rem',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {visibleColumns.includes('done') ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>
          </div>

          {/* Kanban Columns */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(${visibleColumns.length}, 1fr)`,
            gap: '1.5rem',
            alignItems: 'start',
          }}>
            {/* TO DO Column */}
            {visibleColumns.includes('upcoming') && (
              <div>
                <div style={{
                  background: 'var(--terminal-surface)',
                  border: '2px solid var(--terminal-border)',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}>
                  <div style={{ 
                    fontSize: '1rem', 
                    fontWeight: 700, 
                    color: 'var(--terminal-text)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <span>⏳</span>
                    <span>TO DO</span>
                    <span style={{ 
                      fontSize: '0.875rem', 
                      color: 'var(--terminal-text-dim)',
                      marginLeft: 'auto',
                    }}>
                      {upcomingTasks.length}
                    </span>
                  </div>
                </div>
                <div style={{ 
                  minHeight: '400px',
                }}>
                  {upcomingTasks.map(task => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}

            {/* IN PROGRESS Column */}
            {visibleColumns.includes('in-progress') && (
              <div>
                <div style={{
                  background: 'var(--terminal-surface)',
                  border: '2px solid var(--terminal-amber)',
                  padding: '1rem',
                  marginBottom: '1rem',
                  boxShadow: '0 0 20px rgba(255, 182, 39, 0.1)',
                }}>
                  <div style={{ 
                    fontSize: '1rem', 
                    fontWeight: 700, 
                    color: 'var(--terminal-amber)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <span>⚙</span>
                    <span>IN PROGRESS</span>
                    <span style={{ 
                      fontSize: '0.875rem', 
                      color: 'var(--terminal-text-dim)',
                      marginLeft: 'auto',
                    }}>
                      {inProgressTasks.length}
                    </span>
                  </div>
                </div>
                <div style={{ 
                  minHeight: '400px',
                }}>
                  {inProgressTasks.map(task => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}

            {/* DONE Column */}
            {visibleColumns.includes('done') && (
              <div>
                <div style={{
                  background: 'var(--terminal-surface)',
                  border: '2px solid var(--terminal-green)',
                  padding: '1rem',
                  marginBottom: '1rem',
                  boxShadow: '0 0 20px rgba(0, 255, 65, 0.1)',
                }}>
                  <div style={{ 
                    fontSize: '1rem', 
                    fontWeight: 700, 
                    color: 'var(--terminal-green)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <span>✓</span>
                    <span>DONE</span>
                    <span style={{ 
                      fontSize: '0.875rem', 
                      color: 'var(--terminal-text-dim)',
                      marginLeft: 'auto',
                    }}>
                      {doneTasks.length}
                    </span>
                  </div>
                </div>
                <div style={{ 
                  minHeight: '400px',
                }}>
                  {doneTasks.map(task => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feature Request Modal */}
      {showRequestModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '2rem',
        }}
        onClick={() => setShowRequestModal(false)}
        >
          <div 
            style={{
              background: 'var(--terminal-bg)',
              border: '2px solid var(--terminal-green)',
              boxShadow: '0 0 40px rgba(0, 255, 65, 0.3)',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              fontFamily: 'JetBrains Mono, monospace',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '2px solid var(--terminal-green)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(0, 255, 65, 0.05)',
            }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--terminal-green)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                margin: 0,
              }}>
                💡 REQUEST NEW FEATURE
              </h2>
              <button
                onClick={() => setShowRequestModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--terminal-text-dim)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--terminal-text)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem',
                }}>
                  Feature Title *
                </label>
                <input
                  type="text"
                  value={requestTitle}
                  onChange={(e) => setRequestTitle(e.target.value)}
                  placeholder="Enter feature title..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'var(--terminal-surface)',
                    border: '1px solid var(--terminal-border)',
                    color: 'var(--terminal-text)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--terminal-green)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--terminal-border)'}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--terminal-text)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem',
                }}>
                  Feature Description *
                </label>
                <textarea
                  value={requestDescription}
                  onChange={(e) => setRequestDescription(e.target.value)}
                  placeholder="Describe the feature in detail..."
                  rows={6}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'var(--terminal-surface)',
                    border: '1px solid var(--terminal-border)',
                    color: 'var(--terminal-text)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.875rem',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--terminal-green)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--terminal-border)'}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--terminal-text-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem',
                }}>
                  Your Name (Optional)
                </label>
                <input
                  type="text"
                  value={requestName}
                  onChange={(e) => setRequestName(e.target.value)}
                  placeholder="Enter your name..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'var(--terminal-surface)',
                    border: '1px solid var(--terminal-border)',
                    color: 'var(--terminal-text)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--terminal-blue)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--terminal-border)'}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--terminal-text-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem',
                }}>
                  Email (Optional - for notifications)
                </label>
                <input
                  type="email"
                  value={requestEmail}
                  onChange={(e) => setRequestEmail(e.target.value)}
                  placeholder="Enter your email..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'var(--terminal-surface)',
                    border: '1px solid var(--terminal-border)',
                    color: 'var(--terminal-text)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--terminal-blue)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--terminal-border)'}
                />
              </div>

              <button
                onClick={handleSubmitRequest}
                disabled={!requestTitle.trim() || !requestDescription.trim()}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: (!requestTitle.trim() || !requestDescription.trim()) 
                    ? 'var(--terminal-surface)' 
                    : 'var(--terminal-green)',
                  border: '2px solid var(--terminal-green)',
                  color: (!requestTitle.trim() || !requestDescription.trim()) 
                    ? 'var(--terminal-text-dim)' 
                    : '#000',
                  fontSize: '0.875rem',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  cursor: (!requestTitle.trim() || !requestDescription.trim()) 
                    ? 'not-allowed' 
                    : 'pointer',
                  transition: 'all 0.2s',
                  opacity: (!requestTitle.trim() || !requestDescription.trim()) ? 0.5 : 1,
                }}
              >
                SUBMIT REQUEST
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '2rem',
        }}
        onClick={() => setSelectedTask(null)}
        >
          <div 
            style={{
              background: 'var(--terminal-bg)',
              border: `2px solid ${selectedTask.type === 'internal' ? 'var(--terminal-blue)' : 'var(--terminal-green)'}`,
              boxShadow: `0 0 40px ${selectedTask.type === 'internal' ? 'rgba(0, 191, 255, 0.3)' : 'rgba(0, 255, 65, 0.3)'}`,
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              fontFamily: 'JetBrains Mono, monospace',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: `2px solid ${selectedTask.type === 'internal' ? 'var(--terminal-blue)' : 'var(--terminal-green)'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              background: selectedTask.type === 'internal' ? 'rgba(0, 191, 255, 0.05)' : 'rgba(0, 255, 65, 0.05)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'inline-block',
                  fontSize: '0.75rem',
                  padding: '0.5rem 1rem',
                  background: selectedTask.type === 'internal' ? 'rgba(0, 191, 255, 0.2)' : 'rgba(0, 255, 65, 0.2)',
                  color: selectedTask.type === 'internal' ? 'var(--terminal-blue)' : 'var(--terminal-green)',
                  border: `1px solid ${selectedTask.type === 'internal' ? 'var(--terminal-blue)' : 'var(--terminal-green)'}`,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '1rem',
                }}>
                  {selectedTask.type === 'internal' ? '🔧 INTERNAL TASK' : '💡 REQUESTED FEATURE'}
                </div>
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--terminal-text)',
                  lineHeight: 1.3,
                  margin: 0,
                }}>
                  {selectedTask.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--terminal-text-dim)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                  marginLeft: '1rem',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem' }}>
              {/* Task Metadata */}
              <div style={{ 
                display: 'flex', 
                gap: '0.75rem', 
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
              }}>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.5rem 1rem',
                  background: `${getPriorityColor(selectedTask.priority)}20`,
                  color: getPriorityColor(selectedTask.priority),
                  border: `1px solid ${getPriorityColor(selectedTask.priority)}`,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {selectedTask.priority} PRIORITY
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.5rem 1rem',
                  background: 'rgba(0, 191, 255, 0.1)',
                  color: 'var(--terminal-blue)',
                  border: '1px solid var(--terminal-border)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {selectedTask.category}
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.5rem 1rem',
                  background: selectedTask.status === 'done' 
                    ? 'rgba(0, 255, 65, 0.1)' 
                    : selectedTask.status === 'in-progress'
                    ? 'rgba(255, 182, 39, 0.1)'
                    : 'rgba(255, 255, 255, 0.05)',
                  color: selectedTask.status === 'done' 
                    ? 'var(--terminal-green)' 
                    : selectedTask.status === 'in-progress'
                    ? 'var(--terminal-amber)'
                    : 'var(--terminal-text-dim)',
                  border: `1px solid ${
                    selectedTask.status === 'done' 
                      ? 'var(--terminal-green)' 
                      : selectedTask.status === 'in-progress'
                      ? 'var(--terminal-amber)'
                      : 'var(--terminal-border)'
                  }`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {selectedTask.status.replace('-', ' ')}
                </span>
              </div>

              {/* Description */}
              {selectedTask.description && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    color: 'var(--terminal-text)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.75rem',
                  }}>
                    DESCRIPTION
                  </h3>
                  <p style={{
                    fontSize: '0.875rem',
                    color: 'var(--terminal-text-dim)',
                    lineHeight: 1.6,
                    margin: 0,
                  }}>
                    {selectedTask.description}
                  </p>
                </div>
              )}

              {/* Request Context */}
              {selectedTask.request && (
                <div style={{ 
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  background: 'rgba(255, 182, 39, 0.1)',
                  border: '1px solid rgba(255, 182, 39, 0.2)',
                }}>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--terminal-amber)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem',
                  }}>
                    REQUEST CONTEXT
                  </div>
                  <p style={{
                    fontSize: '0.875rem',
                    color: 'var(--terminal-amber)',
                    lineHeight: 1.5,
                    margin: 0,
                  }}>
                    {selectedTask.request}
                  </p>
                </div>
              )}

              {/* Completion Date */}
              {selectedTask.completedDate && (
                <div style={{ 
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  background: 'rgba(0, 255, 65, 0.1)',
                  border: '1px solid var(--terminal-green)',
                }}>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--terminal-green)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    ✓ COMPLETED: {selectedTask.completedDate}
                  </div>
                </div>
              )}

              {/* Comments Section */}
              <div style={{
                borderTop: '2px solid var(--terminal-border)',
                paddingTop: '1.5rem',
              }}>
                <h3 style={{
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: 'var(--terminal-text)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '1rem',
                }}>
                  💬 COMMENTS ({getTaskComments(selectedTask.id).length})
                </h3>

                {/* Comment List */}
                <div style={{ marginBottom: '1.5rem' }}>
                  {getTaskComments(selectedTask.id).length === 0 ? (
                    <div style={{
                      padding: '1rem',
                      background: 'var(--terminal-surface)',
                      border: '1px solid var(--terminal-border)',
                      fontSize: '0.875rem',
                      color: 'var(--terminal-text-dim)',
                      textAlign: 'center',
                    }}>
                      No comments yet. Be the first to comment!
                    </div>
                  ) : (
                    getTaskComments(selectedTask.id).map((comment) => (
                      <div key={comment.id} style={{
                        padding: '1rem',
                        background: 'var(--terminal-surface)',
                        border: '1px solid var(--terminal-border)',
                        marginBottom: '0.75rem',
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '0.5rem',
                        }}>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: 'var(--terminal-blue)',
                          }}>
                            {comment.author}
                          </span>
                          <span style={{
                            fontSize: '0.625rem',
                            color: 'var(--terminal-text-dim)',
                          }}>
                            {new Date(comment.timestamp).toLocaleDateString()} {new Date(comment.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p style={{
                          fontSize: '0.875rem',
                          color: 'var(--terminal-text)',
                          lineHeight: 1.5,
                          margin: 0,
                        }}>
                          {comment.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Comment Form */}
                <div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--terminal-text-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.5rem',
                    }}>
                      Your Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={newCommentAuthor}
                      onChange={(e) => setNewCommentAuthor(e.target.value)}
                      placeholder="Anonymous"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: 'var(--terminal-surface)',
                        border: '1px solid var(--terminal-border)',
                        color: 'var(--terminal-text)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.875rem',
                        outline: 'none',
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--terminal-blue)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--terminal-border)'}
                    />
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--terminal-text)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.5rem',
                    }}>
                      Comment *
                    </label>
                    <textarea
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      placeholder="Add your comment..."
                      rows={4}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: 'var(--terminal-surface)',
                        border: '1px solid var(--terminal-border)',
                        color: 'var(--terminal-text)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.875rem',
                        outline: 'none',
                        resize: 'vertical',
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--terminal-blue)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--terminal-border)'}
                    />
                  </div>

                  <button
                    onClick={handleSubmitComment}
                    disabled={!newCommentText.trim()}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: !newCommentText.trim() 
                        ? 'var(--terminal-surface)' 
                        : 'var(--terminal-blue)',
                      border: '2px solid var(--terminal-blue)',
                      color: !newCommentText.trim() 
                        ? 'var(--terminal-text-dim)' 
                        : '#000',
                      fontSize: '0.875rem',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      cursor: !newCommentText.trim() 
                        ? 'not-allowed' 
                        : 'pointer',
                      transition: 'all 0.2s',
                      opacity: !newCommentText.trim() ? 0.5 : 1,
                    }}
                  >
                    ADD COMMENT
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="classified-footer">
        ALL DATA ACQUIRED VIA OSINT // PUBLIC RECORDS: FEC, SOCIAL MEDIA, NEWS OUTLETS // PROJECT MANAGEMENT DIVISION
      </div>
    </div>
  );
}

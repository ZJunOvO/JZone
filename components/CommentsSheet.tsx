import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { Icons } from './Icons';
import { Comment } from '../types';

interface CommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatTime = (time: number) => {
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const formatRelativeTime = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
};

export const CommentsSheet: React.FC<CommentsSheetProps> = ({ isOpen, onClose }) => {
  const { comments, getCurrentSong, playerState, addComment, seek } = useStore();
  const [inputText, setInputText] = useState('');
  const [anchorTime, setAnchorTime] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  
  const currentSong = getCurrentSong();
  const filteredComments = comments.filter(c => c.songId === currentSong?.id).sort((a, b) => b.timestamp - a.timestamp);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Focus Lock Logic
  const handleFocus = () => {
    setIsFocused(true);
    if (anchorTime === null) {
      setAnchorTime(playerState.currentTime);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Note: We do NOT clear anchorTime on blur immediately, 
    // to allow user to resume editing with the same timestamp.
    // It clears on send or explicit reset.
  };

  const resetAnchor = () => {
    setAnchorTime(playerState.currentTime);
  };

  const adjustAnchor = (amount: number) => {
    if (anchorTime !== null) {
      setAnchorTime(Math.max(0, anchorTime + amount));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentSong) return;

    const newComment: Comment = {
      id: Math.random().toString(36).substr(2, 9),
      songId: currentSong.id,
      userId: 'me',
      username: 'Music Lover', // Hardcoded for demo
      avatarUrl: 'https://picsum.photos/seed/me/100/100',
      text: inputText,
      timestamp: Date.now(),
      playbackTime: anchorTime !== null ? anchorTime : playerState.currentTime,
      likes: 0,
    };

    addComment(newComment);
    setInputText('');
    setAnchorTime(null);
    
    // Scroll to top
    if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[60] flex flex-col justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      {/* Sheet Content */}
      <div className="relative bg-zinc-900/85 backdrop-blur-3xl h-[85vh] w-full rounded-t-[32px] border-t border-white/10 flex flex-col shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.8)] animate-[slideUp_0.35s_cubic-bezier(0.2,0.9,0.3,1)] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-white/5">
           <h3 className="text-lg font-bold text-white tracking-tight">
             评论 <span className="text-zinc-500 font-medium text-sm ml-1">{filteredComments.length}</span>
           </h3>
           <div 
              className="w-10 h-1.5 bg-white/20 rounded-full absolute top-3 left-1/2 -translate-x-1/2 cursor-pointer"
              onClick={onClose}
           ></div>
           <button onClick={onClose} className="p-2 -mr-2 text-white/40 hover:text-white rounded-full transition-colors">
              <Icons.X size={20} strokeWidth={2.5} />
           </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto px-6 py-2 no-scrollbar scroll-smooth" ref={scrollRef}>
           <div className="space-y-6 mt-4 pb-32">
              {filteredComments.map(comment => (
                <div key={comment.id} className={`flex gap-3 group ${comment.isVerified ? 'bg-white/5 p-3 rounded-2xl -mx-3 border border-white/5' : ''}`}>
                   <img 
                      src={comment.avatarUrl} 
                      alt={comment.username} 
                      className="w-9 h-9 rounded-full object-cover shrink-0 border border-white/10" 
                   />
                   <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-bold truncate ${comment.isVerified ? 'text-white' : 'text-zinc-300'}`}>
                          {comment.username}
                        </span>
                        {comment.isVerified && (
                          <Icons.BadgeCheck size={14} className="text-blue-400 fill-blue-500/20" />
                        )}
                        <span className="text-[10px] text-zinc-500 font-medium">
                          {formatRelativeTime(comment.timestamp)}
                        </span>
                      </div>
                      
                      <p className="text-[15px] text-zinc-100 leading-relaxed font-normal break-words">
                        {comment.text}
                      </p>

                      <div className="flex items-center gap-4 mt-2">
                         {/* Time Capsule Badge - The "Jump" feature */}
                         <button 
                           onClick={() => seek(comment.playbackTime)}
                           className="flex items-center gap-1 bg-blue-500/20 hover:bg-blue-500/30 active:bg-blue-500/40 px-2 py-0.5 rounded-full transition-colors group/time"
                         >
                            <Icons.Play size={9} fill="currentColor" className="text-blue-400 group-hover/time:text-blue-300" />
                            <span className="text-[10px] font-bold text-blue-400 group-hover/time:text-blue-300 font-mono tracking-tight">
                              {formatTime(comment.playbackTime)}
                            </span>
                         </button>
                         
                         <button className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-colors">
                            <Icons.Star size={12} strokeWidth={2} />
                            <span className="text-[11px] font-medium">{comment.likes}</span>
                         </button>
                      </div>
                   </div>
                </div>
              ))}
              
              {filteredComments.length === 0 && (
                <div className="text-center py-10 text-zinc-500 text-sm">
                   暂无评论，抢占沙发...
                </div>
              )}
           </div>
        </div>

        {/* Input Area with Mixed Time-Anchor System */}
        <div className="shrink-0 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 px-4 bg-zinc-900 border-t border-white/5 z-20">
           
           {/* Time Anchor Controls - Only visible when we have an anchor time (focused or editing) */}
           {(isFocused || anchorTime !== null) && (
              <div className="flex items-center justify-between mb-3 px-2 animate-[fadeIn_0.2s_ease-out]">
                 <div className="flex items-center gap-3">
                    <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">
                      评论时间点
                    </span>
                    <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 border border-white/5">
                        <button 
                           onClick={() => adjustAnchor(-1)}
                           className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white transition active:bg-white/10 rounded"
                        >
                           <Icons.Minus size={12} />
                        </button>
                        <span className="w-12 text-center text-xs font-mono font-bold text-blue-400 tabular-nums">
                           {formatTime(anchorTime !== null ? anchorTime : playerState.currentTime)}
                        </span>
                        <button 
                           onClick={() => adjustAnchor(1)}
                           className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white transition active:bg-white/10 rounded"
                        >
                           <Icons.Plus size={12} />
                        </button>
                    </div>
                 </div>
                 
                 <button 
                    onClick={resetAnchor}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 bg-zinc-800/50 rounded-full"
                 >
                    <Icons.RotateCcw size={10} />
                    <span>重置同步</span>
                 </button>
              </div>
           )}

           {/* Input Bar */}
           <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <img 
                src="https://picsum.photos/seed/me/100/100" 
                className="w-8 h-8 rounded-full mb-1 border border-white/10"
                alt="Me"
              />
              <div className="flex-1 bg-zinc-800/80 rounded-[20px] px-4 py-2 border border-white/5 focus-within:bg-zinc-800 focus-within:border-white/20 transition-all">
                 <input 
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="发一条友善的评论..."
                    className="w-full bg-transparent text-white text-[15px] placeholder:text-zinc-500 outline-none py-1"
                 />
              </div>
              <button 
                 type="submit"
                 disabled={!inputText.trim()}
                 className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${inputText.trim() ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-100' : 'bg-zinc-800 text-zinc-600 scale-90'}`}
              >
                 <Icons.Send size={18} fill={inputText.trim() ? "currentColor" : "none"} className={inputText.trim() ? "-ml-0.5" : ""} />
              </button>
           </form>
        </div>
      </div>
    </div>
  );
};

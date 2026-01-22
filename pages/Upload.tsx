import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { Song } from '../types';
import { DEMO_AUDIO_URL } from '../constants';

const WaveformCropper = ({ 
    duration, 
    range, 
    setRange, 
    currentTime, 
    onSeek 
}: { 
    duration: number, 
    range: [number, number], 
    setRange: (r: [number, number]) => void,
    currentTime: number,
    onSeek: (t: number) => void
}) => {
    const bars = 50;
    const containerRef = useRef<HTMLDivElement>(null);
    
    const startPct = (range[0] / duration) * 100;
    const endPct = (range[1] / duration) * 100;
    const playheadPct = (currentTime / duration) * 100;

    const handleContainerClick = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickedTime = (x / rect.width) * duration;
        onSeek(clickedTime);
    };

    const handleDrag = (index: 0 | 1, e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
            const newTime = (x / rect.width) * duration;

            if (index === 0) {
                if (newTime < range[1] - 1) setRange([newTime, range[1]]);
            } else {
                if (newTime > range[0] + 1) setRange([range[0], newTime]);
            }
        };

        const stopMove = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', stopMove);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', stopMove);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', stopMove);
        window.addEventListener('touchmove', handleMove);
        window.addEventListener('touchend', stopMove);
    };
    
    return (
        <div 
            ref={containerRef}
            className="h-32 bg-zinc-900 rounded-lg relative overflow-hidden flex items-center justify-between px-2 gap-[2px] select-none touch-none border border-zinc-800 cursor-crosshair"
            onClick={handleContainerClick}
        >
            {/* Waveform Bars */}
            {Array.from({length: bars}).map((_, i) => (
                <div 
                    key={i} 
                    className="flex-1 bg-zinc-700 rounded-full opacity-30" 
                    style={{ height: `${Math.random() * 80 + 20}%` }}
                ></div>
            ))}

            {/* Selected Range Overlay */}
            <div 
                className="absolute top-0 bottom-0 bg-red-500/10 border-x border-red-500/30"
                style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
            ></div>

            {/* Playhead Line */}
            <div 
                className="absolute top-0 bottom-0 w-[2px] bg-white z-20 pointer-events-none shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                style={{ left: `${playheadPct}%` }}
            ></div>

            {/* Drag Handles */}
            <div 
                onMouseDown={(e) => handleDrag(0, e)}
                onTouchStart={(e) => handleDrag(0, e)}
                className="absolute top-0 bottom-0 w-6 -ml-3 cursor-ew-resize flex items-center justify-center z-30 group" 
                style={{ left: `${startPct}%` }}
            >
                <div className="w-1.5 h-10 bg-red-500 rounded-full group-hover:scale-y-125 transition-transform shadow-lg shadow-red-500/50"></div>
            </div>
            <div 
                onMouseDown={(e) => handleDrag(1, e)}
                onTouchStart={(e) => handleDrag(1, e)}
                className="absolute top-0 bottom-0 w-6 -ml-3 cursor-ew-resize flex items-center justify-center z-30 group" 
                style={{ left: `${endPct}%` }}
            >
                <div className="w-1.5 h-10 bg-red-500 rounded-full group-hover:scale-y-125 transition-transform shadow-lg shadow-red-500/50"></div>
            </div>
        </div>
    );
};

export const Upload: React.FC = () => {
  const { addSong, songs, playSong, playerState } = useStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [coverUrl, setCoverUrl] = useState(`https://picsum.photos/seed/${Math.random()}/400/400`);
  const [duration, setDuration] = useState(240);
  const [range, setRange] = useState<[number, number]>([0, 240]);
  const [currentPreviewTime, setCurrentPreviewTime] = useState(0);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const myUploads = songs.filter(s => s.uploadedBy === 'Me' || s.uploadedBy === 'User A');

  useEffect(() => {
    const audio = audioPreviewRef.current;
    if (!audio) return;
    
    const updateTime = () => setCurrentPreviewTime(audio.currentTime);
    audio.addEventListener('timeupdate', updateTime);
    return () => audio.removeEventListener('timeupdate', updateTime);
  }, [step]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile)); 
      setStep(2);

      // Auto-extract metadata from filename
      const nameParts = selectedFile.name.replace(/\.[^/.]+$/, "").split('-');
      if (nameParts.length > 1) {
          setArtist(nameParts[0].trim());
          setTitle(nameParts[1].trim());
      } else {
          setTitle(nameParts[0]);
      }
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setCoverUrl(URL.createObjectURL(file));
    }
  };

  const playPreviewSection = () => {
    if (audioPreviewRef.current) {
        audioPreviewRef.current.currentTime = range[0];
        audioPreviewRef.current.play();
    }
  };

  const handleSeek = (time: number) => {
      if (audioPreviewRef.current) {
          audioPreviewRef.current.currentTime = time;
          setCurrentPreviewTime(time);
      }
  };

  const handleSave = () => {
      const newSong: Song = {
          id: Math.random().toString(36).substr(2, 9),
          title: title || '未命名',
          artist: artist || '未知艺人',
          album: album || '未知专辑',
          coverUrl: coverUrl,
          audioUrl: previewUrl,
          duration: duration,
          trimStart: range[0],
          trimEnd: range[1],
          uploadedBy: 'Me',
          addedAt: Date.now()
      };
      addSong(newSong);
      alert("歌曲已成功保存！");
      setStep(1);
      setFile(null);
      setTitle('');
      setArtist('');
      setAlbum('');
  };

  return (
    <div className="pb-32 pt-14 px-6 space-y-10 min-h-screen">
      <div>
        <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">上传音乐</h1>
        <p className="text-zinc-500 text-sm font-medium">裁剪精彩片段，完善音乐资料。</p>
      </div>

      {step === 1 && (
        <div className="border-2 border-dashed border-zinc-800 rounded-[28px] p-8 flex flex-col items-center justify-center h-56 bg-zinc-900/30 hover:bg-zinc-900/50 transition group">
            <input 
                type="file" 
                accept="audio/*" 
                onChange={handleFileChange} 
                className="hidden" 
                id="audio-upload"
            />
            <label htmlFor="audio-upload" className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-red-600/20 group-hover:scale-110 transition-transform">
                    <Icons.Upload className="text-white" size={24} />
                </div>
                <span className="text-zinc-300 font-bold">点击选择音频文件</span>
                <span className="text-zinc-500 text-[11px] mt-2 font-medium tracking-wide">SUPPORT: MP3, WAV, FLAC</span>
            </label>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-8 animate-[fadeIn_0.3s_ease-out] bg-zinc-900/50 p-6 rounded-[28px] border border-white/5 shadow-2xl">
            {/* Song Cover & File Info */}
            <div className="flex items-center gap-6">
                <div className="relative group shrink-0">
                    <img src={coverUrl} className="w-24 h-24 rounded-2xl object-cover bg-zinc-800 shadow-xl ring-1 ring-white/10" alt="Cover" />
                    <label htmlFor="cover-upload" className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center rounded-2xl cursor-pointer">
                        <Icons.PlusCircle size={20} className="text-white mb-1" />
                        <span className="text-[10px] text-white font-bold">更换封面</span>
                    </label>
                    <input type="file" id="cover-upload" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                </div>
                <div className="overflow-hidden space-y-1">
                    <p className="text-xs font-bold text-red-500 uppercase tracking-widest">正在编辑</p>
                    <p className="text-base font-bold text-white truncate">{file?.name}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">{(file ? file.size / 1024 / 1024 : 0).toFixed(2)} MB</p>
                </div>
            </div>

            {/* Cropper Section */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">裁剪选段</label>
                    <button onClick={playPreviewSection} className="text-[11px] font-bold text-red-500 flex items-center gap-1.5 px-3 py-1 bg-red-500/10 rounded-full active:scale-95 transition">
                        <Icons.Play size={12} fill="currentColor" /> 播放选段
                    </button>
                </div>
                <WaveformCropper 
                    duration={duration} 
                    range={range} 
                    setRange={setRange} 
                    currentTime={currentPreviewTime}
                    onSeek={handleSeek}
                />
                <div className="grid grid-cols-3 text-[10px] text-zinc-500 font-mono font-bold tracking-tight">
                    <div className="text-left">IN: {range[0].toFixed(1)}s</div>
                    <div className="text-center text-red-500/80">LENGTH: {(range[1] - range[0]).toFixed(1)}s</div>
                    <div className="text-right">OUT: {range[1].toFixed(1)}s</div>
                </div>
                <audio 
                    ref={audioPreviewRef} 
                    src={previewUrl} 
                    onLoadedMetadata={(e) => {
                        const dur = e.currentTarget.duration;
                        setDuration(dur);
                        setRange([0, dur]);
                    }}
                />
            </div>

            {/* Metadata Forms */}
            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">歌曲标题</label>
                        <input 
                            type="text" 
                            value={title} 
                            onChange={e => setTitle(e.target.value)}
                            className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
                            placeholder="例如：My New Song"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">艺人</label>
                            <input 
                                type="text" 
                                value={artist}
                                onChange={e => setArtist(e.target.value)}
                                className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
                                placeholder="艺术家名称"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">专辑</label>
                            <input 
                                type="text" 
                                value={album}
                                onChange={e => setAlbum(e.target.value)}
                                className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition placeholder:text-zinc-700"
                                placeholder="所属专辑"
                            />
                        </div>
                    </div>
                    {/* TODO: Add Genre, Year, Lyrics tags for future compatibility */}
                </div>
            </div>

            <div className="flex flex-col gap-3 pt-4">
                <button 
                    onClick={handleSave}
                    className="w-full bg-red-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-red-600/20 active:scale-[0.98] transition-all"
                >
                    确认保存至资料库
                </button>
                <button 
                    onClick={() => setStep(1)}
                    className="w-full text-zinc-500 text-[11px] font-bold py-2 hover:text-white transition uppercase tracking-widest"
                >
                    弃置并重新选择
                </button>
            </div>
        </div>
      )}

      {/* "My Uploads" Media List */}
      <section className="space-y-5">
          <div className="flex items-center justify-between px-1">
              <h2 className="text-xl font-bold text-white tracking-tight">我的上传</h2>
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{myUploads.length} TRACKS</span>
          </div>

          <div className="space-y-2">
              {myUploads.length === 0 ? (
                  <div className="py-12 text-center bg-zinc-900/20 rounded-[28px] border border-white/5 border-dashed">
                      <p className="text-zinc-600 text-sm italic">快去上传你的第一份创作吧</p>
                  </div>
              ) : (
                  myUploads.map((song) => (
                      <div 
                          key={song.id} 
                          onClick={() => playSong(song.id)}
                          className={`flex items-center p-3 rounded-2xl cursor-pointer hover:bg-zinc-900 transition-all active:scale-[0.98] group ${playerState.currentSongId === song.id ? 'bg-zinc-900/80 ring-1 ring-white/5 shadow-xl shadow-black/40' : ''}`}
                      >
                          <div className="relative w-12 h-12 shrink-0 mr-4">
                              <img src={song.coverUrl} className="w-full h-full rounded-lg object-cover bg-zinc-800 shadow-md border border-white/5" alt="art" />
                              {playerState.currentSongId === song.id && playerState.isPlaying && (
                                  <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                                      <div className="flex gap-[2.5px] items-end h-3">
                                          <div className="w-0.5 bg-red-500 animate-[bounce_1s_infinite] h-full"></div>
                                          <div className="w-0.5 bg-red-500 animate-[bounce_1.2s_infinite] h-2/3 shadow-[0_0_4px_rgba(239,68,68,0.5)]"></div>
                                          <div className="w-0.5 bg-red-500 animate-[bounce_0.8s_infinite] h-1/2"></div>
                                      </div>
                                  </div>
                              )}
                          </div>
                          
                          <div className="flex-1 overflow-hidden">
                              <h4 className={`text-sm font-bold truncate tracking-tight ${playerState.currentSongId === song.id ? 'text-red-500' : 'text-zinc-100'}`}>
                                  {song.title}
                              </h4>
                              <p className="text-[11px] text-zinc-500 truncate font-bold mt-0.5 opacity-80">{song.artist} • {song.album}</p>
                          </div>
                          
                          <div className="text-right ml-4 px-2">
                              <p className="text-[9px] text-zinc-600 font-black uppercase tracking-tighter mb-0.5">PLAYS</p>
                              <p className="text-[13px] font-mono text-zinc-400 font-bold tracking-tighter">{(Math.floor(Math.random() * 500) + 1).toLocaleString()}</p>
                          </div>
                      </div>
                  ))
              )}
          </div>
      </section>
    </div>
  );
};

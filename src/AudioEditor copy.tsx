import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Mic, ArrowLeft, Save, Download, Circle, SkipBack } from 'lucide-react';
import { useAuth } from './AuthContext';

interface AudioEditorProps { songId?: string; recordingId?: string; onSave: (audioBlob: Blob) => Promise<void>; onCancel: () => void; }
interface Song { id: number; name: string; description: string; genre: string; bpm: string; tom: string; duration: string; audio_path: string; };
interface AudioTrack { buffer: AudioBuffer | null; volume: number; name: string; }
interface Position { current: number; duration: number; }
interface RecordingSegment { buffer: AudioBuffer; startTime: number; endTime: number; }

const AudioEditor: React.FC<AudioEditorProps> = ({ songId, recordingId, onSave, onCancel }) =>
{
    const { token, apiUrl, baseUrl } = useAuth();
    const [songData, setSongData] = useState<Song | null>(null);

    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [musicTrack, setMusicTrack] = useState<AudioTrack>({ buffer: null, volume: 0.5, name: '' });
    const [voiceTrack, setVoiceTrack] = useState<AudioTrack>({ buffer: null, volume: 0.8, name: 'Gravação de Voz' });
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [position, setPosition] = useState<Position>({ current: 0, duration: 0 });
    const [recordingSegments, setRecordingSegments] = useState<RecordingSegment[]>([]);

    const musicCanvasRef = useRef<HTMLCanvasElement>(null);
    const voiceCanvasRef = useRef<HTMLCanvasElement>(null);
    const musicSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const musicGainRef = useRef<GainNode | null>(null);
    const voiceGainRef = useRef<GainNode | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const animationFrameRef = useRef<number>();
    const startTimeRef = useRef<number>(0);
    const startOffsetRef = useRef<number>(0);
    const recordingStartTimeRef = useRef<number>(0);
    const recordingStartPositionRef = useRef<number>(0);
    const isDraggingRef = useRef<boolean>(false);
    const currentRecordingSegmentRef = useRef<RecordingSegment | null>(null);

    useEffect(() =>
    {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(ctx);

        return () => { ctx.close().catch((err) => { console.error("Error closing AudioContext:", err); }); };
    }, []);

    const loadMusicTrack = useCallback(async (audioPath: string) =>
    {
        if (!audioContext) return null;

        try
        {
            const response = await fetch(`${baseUrl}/${audioPath}`);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = await audioContext.decodeAudioData(arrayBuffer);

            return buffer;
        }
        catch (error)
        {
            console.error('Error loading music:', error);
            return null;
        }
    }, [audioContext]);

    const loadRecordingTrack = useCallback(async (audioPath: string, musicDuration: number) =>
    {
        if (!audioContext || musicDuration <= 0) return;

        try
        {
        const response = await fetch(`${baseUrl}/${audioPath}`);
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await audioContext.decodeAudioData(arrayBuffer);

        const segment: RecordingSegment = { buffer: decoded, startTime: 0, endTime: decoded.duration };

        setRecordingSegments([segment]);
        setVoiceTrack(prev => ({ ...prev, buffer: decoded }));
        }
        catch (error)
        {
        console.error('Error loading recording:', error);
        }
    }, [audioContext]);

    useEffect(() =>
    {
        if (!audioContext || !token) return;

        const fetchData = async () =>
        {
        try
        {
            let currentRecordingId = recordingId;
            if (!currentRecordingId) currentRecordingId = window.location.pathname.split('/')[4];

            if (!songId) throw new Error('Erro ao receber ID da música');

            const songResponse = await fetch( `${apiUrl}/songs/${songId}`, { headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }});

            if (!songResponse.ok) throw new Error('Erro ao carregar dados da música');

            const songs: Song[] = await songResponse.json();
            const song = songs[0];
            
            setSongData(song);

            if (song)
            {
                const musicBuffer = await loadMusicTrack(song.audio_path);
                
                if (musicBuffer)
                {
                    setMusicTrack({ buffer: musicBuffer, volume: 0.5, name: song.name || 'Música' });
                    setPosition({ current: 0, duration: musicBuffer.duration });
                    
                    if (Number(currentRecordingId) > 0)
                    {
                        const recordingResponse = await fetch(`${apiUrl}/recordings/id/${currentRecordingId}`, 
                            { headers: {'Authorization': `Bearer ${token}`,'Content-Type': 'application/json' }});

                        if (recordingResponse.ok)
                        {
                            const recording = await recordingResponse.json();
                            if (recording && recording[0] && recording[0].audio_path) await loadRecordingTrack(recording[0].audio_path, musicBuffer.duration);
                        }
                    }
                }
            }
        }
        catch (error)
        {
            console.error(error);
        }
        };

        fetchData();
    }, [songId, recordingId, token, audioContext, loadMusicTrack, loadRecordingTrack]);

    const drawWaveform = useCallback(( canvas: HTMLCanvasElement, buffer: AudioBuffer | null, color: string, progress: number = 0, segments: RecordingSegment[] = [] ) =>
    {
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        if (segments.length > 0 && position.duration > 0)
        {
        segments.forEach(segment =>
        {
            const startX = (segment.startTime / position.duration) * width;
            const endX = (segment.endTime / position.duration) * width;
            const segmentWidth = endX - startX;

            if (segmentWidth > 0)
            {
            const data = segment.buffer.getChannelData(0);
            const samplesPerPixel = Math.ceil(data.length / segmentWidth);

            ctx.fillStyle = '#10B981';
            for (let i = 0; i < segmentWidth; i++)
            {
                let min = 1.0;
                let max = -1.0;

                for (let j = 0; j < samplesPerPixel; j++)
                {
                const dataIndex = Math.floor(i * samplesPerPixel + j);
                if (dataIndex < data.length)
                {
                    const datum = data[dataIndex];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
                }

                if (min !== 1.0 && max !== -1.0)
                {
                const barHeight = Math.max(1, (max - min) * height / 2);
                const y = height / 2 - barHeight / 2;

                ctx.fillRect(startX + i, y, 1, barHeight);
                }
            }
            }
        });

        if (isRecording && currentRecordingSegmentRef.current)
        {
            const currentSegment = currentRecordingSegmentRef.current;
            const startX = (currentSegment.startTime / position.duration) * width;
            const currentX = (position.current / position.duration) * width;
            const segmentWidth = currentX - startX;

            if (segmentWidth > 0)
            {
            const data = currentSegment.buffer.getChannelData(0);
            const samplesPerPixel = Math.ceil(data.length / segmentWidth);

            ctx.fillStyle = '#EF4444';
            for (let i = 0; i < segmentWidth; i++)
            {
                let min = 1.0;
                let max = -1.0;

                for (let j = 0; j < samplesPerPixel; j++)
                {
                const dataIndex = Math.floor(i * samplesPerPixel + j);
                if (dataIndex < data.length)
                {
                    const datum = data[dataIndex];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
                }

                if (min !== 1.0 && max !== -1.0)
                {
                const barHeight = Math.max(1, (max - min) * height / 2);
                const y = height / 2 - barHeight / 2;

                ctx.fillRect(startX + i, y, 1, barHeight);
                }
            }
            }
        }
        }

        if (buffer)
        {
        const data = buffer.getChannelData(0);
        const samplesPerPixel = Math.ceil(data.length / width);

        ctx.fillStyle = color;
        for (let i = 0; i < width; i++)
        {
            let min = 1.0;
            let max = -1.0;

            for (let j = 0; j < samplesPerPixel; j++)
            {
            const dataIndex = i * samplesPerPixel + j;
            if (dataIndex < data.length)
            {
                const datum = data[dataIndex];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            }

            if (min !== 1.0 && max !== -1.0)
            {
            const barHeight = Math.max(1, (max - min) * height / 2);
            const y = height / 2 - barHeight / 2;

            ctx.fillRect(i, y, 1, barHeight);
            }
        }
        }

        const progressX = Math.floor(progress * width);
        ctx.strokeStyle = 'red';
        ctx.beginPath();
        ctx.moveTo(progressX + 0.5, 0);
        ctx.lineTo(progressX + 0.5, height);
        ctx.lineWidth = 3;
        ctx.stroke();
    }, [isRecording, position.duration]);

    const sliceAudioBuffer = useCallback((buffer: AudioBuffer, startSeconds: number, durationSeconds: number): AudioBuffer | null => {
        if (!audioContext) return null;
        const sampleRate = buffer.sampleRate;
        const startSample = Math.floor(startSeconds * sampleRate);
        const endSample = Math.floor((startSeconds + durationSeconds) * sampleRate);
        const length = endSample - startSample;
        if (length <= 0) return null;

        const newBuffer = audioContext.createBuffer(buffer.numberOfChannels, length, sampleRate);
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const channelData = buffer.getChannelData(channel).subarray(startSample, endSample);
        newBuffer.copyToChannel(channelData, channel);
        }
        return newBuffer;
    }, [audioContext]);

    const combineRecordingSegments = useCallback(( segments: RecordingSegment[], totalDuration: number, sampleRate: number ) =>
    {
        if (segments.length === 0 || !audioContext) return null;

        const totalSamples = Math.floor(totalDuration * sampleRate);
        const combinedBuffer = audioContext.createBuffer(1, totalSamples, sampleRate);
        const combinedData = combinedBuffer.getChannelData(0);

        combinedData.fill(0);

        segments.forEach(segment =>
        {
        const startSample = Math.floor(segment.startTime * sampleRate);
        const segmentData = segment.buffer.getChannelData(0);

        for (let i = 0; i < segmentData.length && (startSample + i) < totalSamples; i++) combinedData[startSample + i] = segmentData[i];
        });

        return combinedBuffer;
    }, [audioContext]);

    useEffect(() =>
    {
        if (recordingSegments.length > 0 && musicTrack.buffer)
        {
        const combinedBuffer = combineRecordingSegments( recordingSegments, musicTrack.buffer.duration, musicTrack.buffer.sampleRate );
        if (combinedBuffer) setVoiceTrack(prev => ({ ...prev, buffer: combinedBuffer }));
        }
        else if (recordingSegments.length === 0)
        {
        setVoiceTrack(prev => ({ ...prev, buffer: null }));
        }
    }, [recordingSegments, musicTrack.buffer, combineRecordingSegments]);

    useEffect(() =>
    {
        if (musicCanvasRef.current && musicTrack.buffer)
        {
        const progress = position.duration > 0 ? position.current / position.duration : 0;
        drawWaveform(musicCanvasRef.current, musicTrack.buffer, '#34D399', progress);
        }
    }, [musicTrack.buffer, position, drawWaveform]);

    useEffect(() =>
    {
        if (voiceCanvasRef.current)
        {
        const progress = position.duration > 0 ? position.current / position.duration : 0;
        
        if (voiceTrack.buffer || recordingSegments.length > 0)
        {
            drawWaveform(voiceCanvasRef.current, voiceTrack.buffer, '#B88F8B', progress, recordingSegments);
        }
        else
        {
            const ctx = voiceCanvasRef.current.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, voiceCanvasRef.current.width, voiceCanvasRef.current.height);
        }
        }
    }, [voiceTrack.buffer, recordingSegments, position, drawWaveform]);

    useEffect(() => {
        if (!isPlaying || !audioContext || !voiceTrack.buffer) return;

        if (voiceSourceRef.current) {
        voiceSourceRef.current.stop();
        voiceSourceRef.current.disconnect();
        voiceSourceRef.current = null;
        }

        if (voiceGainRef.current) {
        voiceGainRef.current.disconnect();
        voiceGainRef.current = null;
        }

        const voiceSource = audioContext.createBufferSource();
        voiceSource.buffer = voiceTrack.buffer;
        const voiceGain = audioContext.createGain();
        voiceGain.gain.value = voiceTrack.volume;
        voiceSource.connect(voiceGain).connect(audioContext.destination);
        voiceSource.start(0, position.current);
        voiceSourceRef.current = voiceSource;
        voiceGainRef.current = voiceGain;

    }, [voiceTrack.buffer]);

    const stopCurrentAudio = useCallback(() =>
    {
        if (musicSourceRef.current)
        {
            musicSourceRef.current.stop();
            musicSourceRef.current = null;
        }

        setVoiceTrack(prev => ({ ...prev, volume: 0.8 }));
        if (voiceGainRef.current) voiceGainRef.current.gain.value = 0.8;

        if (voiceSourceRef.current)
        {
            voiceSourceRef.current.stop();
            voiceSourceRef.current = null;
        }

        if (animationFrameRef.current)
        {
            cancelAnimationFrame(animationFrameRef.current);
        }
    }, []);

    const play = useCallback(() => 
    {
        if (!audioContext || !musicTrack.buffer) return;

        if (audioContext.state === 'suspended') audioContext.resume();

        stopCurrentAudio();

        const startOffset = position.current;
        startOffsetRef.current = startOffset;
        startTimeRef.current = audioContext.currentTime;

        const remainingDuration = position.duration - startOffset;
        if (remainingDuration <= 0) return;

        const musicSource = audioContext.createBufferSource();
        const musicGain = audioContext.createGain();
        musicSource.buffer = musicTrack.buffer;
        musicGain.gain.value = musicTrack.volume;
        musicSource.connect(musicGain).connect(audioContext.destination);
        musicSource.start(0, startOffset);
        musicSourceRef.current = musicSource;
        musicGainRef.current = musicGain;

        if (voiceTrack.buffer) 
        {
        const voiceSource = audioContext.createBufferSource();
        const voiceGain = audioContext.createGain();
        voiceSource.buffer = voiceTrack.buffer;
        voiceGain.gain.value = voiceTrack.volume;
        voiceSource.connect(voiceGain).connect(audioContext.destination);
        voiceSource.start(0, startOffset);
        voiceSourceRef.current = voiceSource;
        voiceGainRef.current = voiceGain;
        }

        setIsPlaying(true);
    }, [audioContext, musicTrack, voiceTrack, position, stopCurrentAudio]);

    const pause = useCallback(() =>
    {
        stopCurrentAudio();
        setIsPlaying(false);

        if (isRecording && mediaRecorderRef.current) 
        {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
            setIsRecording(false);
            currentRecordingSegmentRef.current = null;
        }
    }, [stopCurrentAudio, isRecording]);

    const updatePosition = useCallback(() => 
    {
        if (!isPlaying || !audioContext || isDraggingRef.current) return;

        const elapsed = audioContext.currentTime - startTimeRef.current;
        let newPosition = startOffsetRef.current + elapsed;

        if (newPosition >= position.duration) 
        {
        newPosition = position.duration;
        setIsPlaying(false);
        stopCurrentAudio();
        }

        setPosition(prev => ({ ...prev, current: newPosition }));

        if (isPlaying && newPosition < position.duration) animationFrameRef.current = requestAnimationFrame(updatePosition);
    }, [isPlaying, audioContext, position.duration, stopCurrentAudio]);

    useEffect(() => 
    {
        if (isPlaying && !isDraggingRef.current) animationFrameRef.current = requestAnimationFrame(updatePosition);
        
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
    }, [isPlaying, updatePosition]);

    const seekTo = useCallback((newPosition: number) => 
    {
        if (!position.duration) return;

        const clampedPosition = Math.max(0, Math.min(newPosition, position.duration));
        
        setPosition(prev => ({ ...prev, current: clampedPosition }));
        startOffsetRef.current = clampedPosition;
        startTimeRef.current = audioContext?.currentTime || 0;

        if (isPlaying) 
        {
        stopCurrentAudio();
        play();
        }
    }, [position.duration, isPlaying, audioContext, play, stopCurrentAudio]);

    const handleCanvasSeek = (event: React.MouseEvent<HTMLCanvasElement>) => 
    {
        if (!position.duration) return;

        const rect = event.currentTarget.getBoundingClientRect();
        const clickX = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
        const newPosition = (clickX / rect.width) * position.duration;

        seekTo(newPosition);
    };

    const handleCanvasSeekStart = (event: React.MouseEvent<HTMLCanvasElement>) => 
    {
        if (!position.duration) return;

        isDraggingRef.current = true;
        handleCanvasSeek(event);
    };

    const handleCanvasSeekMove = (event: React.MouseEvent<HTMLCanvasElement>) => 
    {
        if (!isDraggingRef.current || !position.duration) return;

        const rect = (event.currentTarget as HTMLCanvasElement).getBoundingClientRect();
        const moveX = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
        const newPosition = (moveX / rect.width) * position.duration;

        seekTo(newPosition);
    };

    const handleCanvasSeekEnd = () => 
    {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;

        if (isPlaying) setTimeout(() => play(), 10);
    };

    const skipBackward = () => seekTo(position.current - 10);

    const handleSeekEnd = () =>
    {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;

        if (isPlaying) setTimeout(() => play(), 10);
    };

    useEffect(() =>
    {
        const handleMouseUp = () => handleSeekEnd();
        const handleMouseLeave = () => handleSeekEnd();

        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('mouseleave', handleMouseLeave);

        return () =>
        {
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, []);

    const startRecording = async () =>
    {
        if (!audioContext || !musicTrack.buffer) return;

        try
        {
            setVoiceTrack(prev => ({ ...prev, volume: 0 }));
            if (voiceGainRef.current) voiceGainRef.current.gain.value = 0;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }});

            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

            recordedChunksRef.current = [];
            recordingStartTimeRef.current = audioContext.currentTime;
            recordingStartPositionRef.current = position.current;

            mediaRecorder.ondataavailable = (event) =>
            {
                if (event.data.size > 0) recordedChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = async () =>
            {
                try
                {
                const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();
                const recordedBuffer = await audioContext.decodeAudioData(arrayBuffer);

                const recordingEndPosition = position.current;

                const newSegment: RecordingSegment = {buffer: recordedBuffer, startTime: recordingStartPositionRef.current, endTime: recordingEndPosition };

                currentRecordingSegmentRef.current = newSegment;

                setRecordingSegments(prev => {
                    let newSegments: RecordingSegment[] = [];

                    for (let segment of prev) {
                    if (segment.endTime <= newSegment.startTime || segment.startTime >= newSegment.endTime) {
                        newSegments.push(segment);
                    } else {
                        // Overlap: split segment
                        if (segment.startTime < newSegment.startTime) {
                        const leftDuration = newSegment.startTime - segment.startTime;
                        const leftBuffer = sliceAudioBuffer(segment.buffer, 0, leftDuration);
                        if (leftBuffer) {
                            newSegments.push({ buffer: leftBuffer, startTime: segment.startTime, endTime: newSegment.startTime });
                        }
                        }
                        if (segment.endTime > newSegment.endTime) {
                        const rightStart = newSegment.endTime - segment.startTime;
                        const rightDuration = segment.endTime - newSegment.endTime;
                        const rightBuffer = sliceAudioBuffer(segment.buffer, rightStart, rightDuration);
                        if (rightBuffer) {
                            newSegments.push({ buffer: rightBuffer, startTime: newSegment.endTime, endTime: segment.endTime });
                        }
                        }
                    }
                    }

                    newSegments.push(newSegment);
                    newSegments.sort((a, b) => a.startTime - b.startTime);
                    return newSegments;
                });

                currentRecordingSegmentRef.current = null;
                stream.getTracks().forEach(track => track.stop());
            }
            catch (error)
            {
            console.error('Erro ao processar gravação:', error);
            }
        };

        mediaRecorder.start(100);
        mediaRecorderRef.current = mediaRecorder;
        setIsRecording(true);

        if (!isPlaying) play();
        }
        catch (error)
        {
        console.error('Erro ao iniciar gravação:', error);
        alert('Erro ao acessar o microfone. Verifique as permissões.');
        }
    };

    const stopRecording = () => 
    {
        if (mediaRecorderRef.current && isRecording) 
        {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
        }

        setVoiceTrack(prev => ({ ...prev, volume: 0.8 }));
        if (voiceGainRef.current) voiceGainRef.current.gain.value = 0.8;

        if (musicSourceRef.current) 
        {
            try { musicSourceRef.current.stop(); } catch {}
            musicSourceRef.current = null;
        }

        if (voiceSourceRef.current) 
        {
            try { voiceSourceRef.current.stop(); } catch {}
            voiceSourceRef.current = null;
        }

        setIsRecording(false);
        currentRecordingSegmentRef.current = null;
        setIsPlaying(false);
    };

    useEffect(() =>
    {
        if (musicGainRef.current) musicGainRef.current.gain.value = musicTrack.volume;
    }, [musicTrack.volume]);

    useEffect(() =>
    {
        if (voiceGainRef.current) voiceGainRef.current.gain.value = voiceTrack.volume;
    }, [voiceTrack.volume]);

    const saveAudio = async () =>
    {
        if (!audioContext || !voiceTrack.buffer) { alert('Grave algo primeiro.'); return; }

        alert('Salvando gravação... Não feche ou recarregue a página até o término.');

        try
        {
            const offlineContext = new OfflineAudioContext(1, voiceTrack.buffer.sampleRate * voiceTrack.buffer.duration, voiceTrack.buffer.sampleRate);

            const voiceSource = offlineContext.createBufferSource();
            const voiceGain = offlineContext.createGain();
            voiceSource.buffer = voiceTrack.buffer;
            voiceGain.gain.value = voiceTrack.volume;
            voiceSource.connect(voiceGain);
            voiceGain.connect(offlineContext.destination);
            voiceSource.start(0);

            const renderedBuffer = await offlineContext.startRendering();

            const length = renderedBuffer.length;
            const arrayBuffer = new ArrayBuffer(44 + length * 2);
            const view = new DataView(arrayBuffer);

            const writeString = (offset: number, string: string) =>
            {
                for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
            };

            writeString(0, 'RIFF');
            view.setUint32(4, 36 + length * 2, true);
            writeString(8, 'WAVE');
            writeString(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, renderedBuffer.sampleRate, true);
            view.setUint32(28, renderedBuffer.sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeString(36, 'data');
            view.setUint32(40, length * 2, true);

            const channel = renderedBuffer.getChannelData(0);
            let offset = 44;

            for (let i = 0; i < length; i++)
            {
                const sample = Math.max(-1, Math.min(1, channel[i]));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }

            const blob = new Blob([arrayBuffer], { type: 'audio/wav' });

            const name = prompt("Digite o nome da gravação:", `Gravação ${new Date().toLocaleString()}`) || `Gravação ${new Date().toLocaleString()}`;
            if (!name) return;

            const formData = new FormData();
            formData.append('name', name);
            formData.append('audio', blob, 'recording.wav');

            const isEditMode = window.location.pathname.includes('/edit');
            let url = `${apiUrl}/recordings`;

            let method = 'POST';
            let currentRecordingId = recordingId;

            if (!currentRecordingId) currentRecordingId = window.location.pathname.split('/')[4];

            if (isEditMode && currentRecordingId)
            {
                url += `/${currentRecordingId}`;
                method = 'PUT';
            }
            else
            {
                formData.append('song_id', songId || '');
            }

            const response = await fetch(url, { method, headers: {'Authorization': `Bearer ${token}`,}, body: formData });

            if (!response.ok) throw new Error(`Erro ao ${isEditMode ? 'atualizar' : 'salvar'}`);

            await onSave(blob);

            alert(`Gravação ${isEditMode ? 'atualizada' : 'salva'} com sucesso!`);
        }
        catch (error)
        {
            alert('Erro ao exportar áudio. Tente novamente.');
        }
    };

    const exportAudio = async () =>
    {
        if (!audioContext || !musicTrack.buffer) return;

        try
        {
        const offlineContext = new OfflineAudioContext(
            2,
            musicTrack.buffer.sampleRate * musicTrack.buffer.duration,
            musicTrack.buffer.sampleRate
        );

        const musicSource = offlineContext.createBufferSource();
        const musicGain = offlineContext.createGain();
        musicSource.buffer = musicTrack.buffer;
        musicGain.gain.value = musicTrack.volume;
        musicSource.connect(musicGain);
        musicGain.connect(offlineContext.destination);
        musicSource.start(0);

        if (voiceTrack.buffer)
        {
            const voiceSource = offlineContext.createBufferSource();
            const voiceGain = offlineContext.createGain();
            voiceSource.buffer = voiceTrack.buffer;
            voiceGain.gain.value = voiceTrack.volume;
            voiceSource.connect(voiceGain);
            voiceGain.connect(offlineContext.destination);
            voiceSource.start(0);
        }

        const renderedBuffer = await offlineContext.startRendering();

        const length = renderedBuffer.length;
        const arrayBuffer = new ArrayBuffer(44 + length * 4);
        const view = new DataView(arrayBuffer);

        const writeString = (offset: number, string: string) =>
        {
            for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 4, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 2, true);
        view.setUint32(24, renderedBuffer.sampleRate, true);
        view.setUint32(28, renderedBuffer.sampleRate * 4, true);
        view.setUint16(32, 4, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * 4, true);

        const leftChannel = renderedBuffer.getChannelData(0);
        const rightChannel = renderedBuffer.numberOfChannels > 1 ? renderedBuffer.getChannelData(1) : leftChannel;
        let offset = 44;

        for (let i = 0; i < length; i++)
        {
            const leftSample = Math.max(-1, Math.min(1, leftChannel[i]));
            const rightSample = Math.max(-1, Math.min(1, rightChannel[i]));

            view.setInt16(offset, leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7FFF, true);
            view.setInt16(offset + 2, rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7FFF, true);
            offset += 4;
        }

        const blob = new Blob([arrayBuffer], { type: 'audio/wav' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mixagem_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.wav`;
        a.click();
        URL.revokeObjectURL(url);
        }
        catch (error)
        {
        console.error('Erro ao exportar áudio:', error);
        alert('Erro ao exportar áudio. Tente novamente.');
        }
    };

    useEffect(() => 
    {
        const handleKeyDown = (e: KeyboardEvent) => 
        {
            if (e.code === "Space") 
            {
                e.preventDefault();

                if (isPlaying) 
                {
                    stopCurrentAudio();
                    setIsPlaying(false);
                } 
                else 
                {
                    play();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isPlaying, play, stopCurrentAudio]);

    return (
        <div className="min-h-screen bg-black p-4">
            <div className="max-w-6xl mx-auto">
                <div className="fixed top-0 left-0 right-0 bg-stone-900 bg-opacity-95 backdrop-blur-sm shadow-md z-50 p-4 flex justify-start items-center gap-8 text-white font-mono text-sm select-none">
                <button onClick={onCancel} className="flex gap-4 items-center justify-center border border-emerald-400 rounded-lg px-4 py-2">
                    <ArrowLeft size={20} /> Voltar
                </button>
                <div className="flex flex-col">
                    <h1 className="text-xl font-semibold">
                    {songData?.name || 'Nenhuma música carregada'}
                    </h1>
                    <div className="text-stone-200 flex gap-4">
                    <span>{songData?.genre || ''}</span><span>•</span>
                    <span>BPM: {songData?.bpm || ''}</span><span>•</span>
                    <span>Tom: {songData?.tom || ''}</span><span>•</span>
                    <span>Duração: {songData?.duration}</span>
                    </div>
                </div>
                </div>

                <div className="relative bg-stone-800 p-6 pb-0 rounded-t-xl mt-24">
                {position.duration > 0 && (
                    <div className="relative mb-16 w-full font-mono">
                    <div className="absolute top-0 left-0 right-0 flex justify-between text-sm text-stone-200 tracking-tight select-none px-1">
                        {Array.from({ length: Math.ceil(position.duration / 30) + 1 }, (_, i) => {
                        const seconds = i * 30;
                        const minutes = Math.floor(seconds / 60);
                        const secs = Math.floor(seconds % 60);
                        const timeString = `${minutes}:${secs.toString().padStart(2, '0')}`;
                        return <span key={i}>{timeString}</span>;
                        })}
                    </div>
                    </div>
                )}

                <div className="grid grid-cols-1">
                    <div>
                    <div className="flex items-center justify-end mb-4">
                        <div className="flex items-center gap-2">
                        <input type="range" min="0" max="1"  step="0.01" value={musicTrack.volume} onChange={(e) => setMusicTrack(prev => ({...prev, volume: parseFloat(e.target.value)}))}
                            className="w-20 accent-emerald-400"/>
                        <span className="text-xs text-white w-8">{Math.round(musicTrack.volume * 100)}%</span>
                        </div>
                    </div>
                        <canvas ref={musicCanvasRef} width={1000} height={100} 
                            onMouseDown={handleCanvasSeekStart} onMouseMove={handleCanvasSeekMove} onMouseUp={handleCanvasSeekEnd} onMouseLeave={handleCanvasSeekEnd}
                            className="w-full h-30 mb-2 bg-transparent cursor-pointer"/>
                    <h3 className="text-base text-stone-200 pb-2 border-b border-stone-600">
                        {songData?.name || 'Música'}
                    </h3>
                    </div>

                    <div>
                    <div className="flex items-center justify-end mb-4">
                        <div className="flex items-center gap-2 mt-4">
                        <input type="range" min="0" max="1" step="0.01" value={voiceTrack.volume} onChange={(e) => setVoiceTrack(prev => ({...prev, volume: parseFloat(e.target.value)}))}
                            className="w-20 accent-emerald-400"/>
                        <span className="text-xs text-white w-8">{Math.round(voiceTrack.volume * 100)}%</span>
                        </div>
                    </div>
                    <div className="relative">
                        <canvas ref={voiceCanvasRef} width={1000} height={100}
                            onMouseDown={handleCanvasSeekStart} onMouseMove={handleCanvasSeekMove} onMouseUp={handleCanvasSeekEnd} onMouseLeave={handleCanvasSeekEnd}
                            className="w-full h-30 mb-2 bg-transparent cursor-pointer"/>
                        <h3 className="text-base text-stone-200 pb-2 border-b border-stone-600">
                        Vocal
                        </h3>
                    </div>
                    </div>
                </div>
                </div>

                <div className="flex justify-end items-center gap-10 pr-24 bg-stone-800 p-6 rounded-b-xl">
                <button onClick={skipBackward} className="flex items-center justify-center bg-gray-800 text-white border border-stone-600 rounded-full p-4 hover:bg-slate-700">
                    <SkipBack fill="gray" strokeWidth={1} size={30} />
                </button>

                <button onClick={isPlaying ? pause : play} className="flex items-center justify-center rounded-full p-8 bg-emerald-400 text-white hover:bg-emerald-500 transition-colors">
                    {isPlaying ? <Pause fill="black" strokeWidth={0} size={30} /> : <Play fill="black" strokeWidth={0} size={30} />}
                </button>

                <button onClick={isRecording ? stopRecording : startRecording} className={`flex items-center p-4 rounded-full transition-colors border border-stone-600 ${isRecording ? 'bg-gray-800 hover:bg-red-700 text-white' : 'bg-green-500 hover:bg-green-700'}`}>
                    {isRecording ? <Circle fill="red" strokeWidth={0} size={30} /> : <Mic size={30} />}
                </button>

                <button onClick={saveAudio}
                    className="flex items-center gap-2 px-4 py-2 bg-transparent text-white border border-white rounded-lg hover:bg-stone-900 transition-colors">
                    <Save size={20}/>  Salvar
                </button>

                <button onClick={exportAudio}
                    className="flex items-center gap-2 px-4 py-2 bg-transparent text-white border border-white rounded-lg hover:bg-stone-900 transition-colors">
                    <Download size={20}/>  Download
                </button>

                </div>
            </div>
        </div>
    );
};

export default AudioEditor;
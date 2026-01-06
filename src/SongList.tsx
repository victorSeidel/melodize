import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';

interface Song { id: number; name: string; description: string; genre: string; bpm: string; tom: string; duration: string; audio_path: string; };

const SongList: React.FC = () => 
{
    const [songs, setSongs] = useState<Song[]>([]);
    const [recordings, setRecordings] = useState<[]>([]);
    const { user, token, apiUrl, logout } = useAuth();
    const navigate = useNavigate();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGenre, setSelectedGenre] = useState('Todos os Estilos');

    const [showModal, setShowModal] = useState(false);
    const [newSong, setNewSong] = useState({ name: '',  description: '', genre: '', bpm: '', tom: '', duration: '', audio: null as File | null });

    useEffect(() => 
    {
        if (!token) 
        {
        navigate('/login');
        return;
        }

        const fetchData = async () => 
        {
        try 
        {
            const response = await fetch(`${apiUrl}/songs`, { headers: { 'Authorization': `Bearer ${token}` }, });
            const data = await response.json();
            setSongs(data);

            const responseR = await fetch(`${apiUrl}/recordings`, { headers: { 'Authorization': `Bearer ${token}` }, });
            const dataR = await responseR.json();
            setRecordings(dataR);
        } 
        catch (error) 
        {
            console.error(error);
        }
        };

        fetchData();
    }, [token, navigate]);

    const handleLogout = () => 
    {
        logout();
        navigate('/login');
    };

    const genresCount: { [key: string]: number } = songs.reduce((acc: { [key: string]: number }, song) => 
    {
        const genre = song.genre;
        acc[genre] = (acc[genre] || 0) + 1;
        return acc;
    }, {});

    const totalGenres = Object.keys(genresCount).length;
    const genreButtons = [ `Todos os Estilos (${totalGenres})`, ...Object.entries(genresCount).map(([genre, count]) => `${genre} (${count})`) ];

    const filteredSongs = songs.filter((song) => 
    {
        const matchesGenre = selectedGenre === 'Todos os Estilos' || song.genre === selectedGenre;
        const matchesSearch = song.name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesGenre && matchesSearch;
    });

    const handleNewRecording = (songId: number) => { navigate(`/songs/${songId}/recordings/new`); };

    const handleDeleteSong = async (songId: number) => 
    {  
        try 
        {
            if (!confirm('Tem certeza? Essa ação é irreversível')) return;

            const response = await fetch(`${apiUrl}/songs/${songId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }, });

            if (!response.ok) alert('Erro ao excluir música. Tente novamente.');

            setSongs(prevSongs => prevSongs.filter(song => song.id !== songId));
        } 
        catch (error) 
        {
            console.error(error);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { const { name, value } = e.target; setNewSong(prev => ({ ...prev, [name]: value })); };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) setNewSong(prev => ({ ...prev, audio: e.target.files![0] })); };

    const handleSubmit = async (e: React.FormEvent) => 
    {
            e.preventDefault();

            if (!newSong.audio || !token) return;

            const formData = new FormData();
            formData.append('name', newSong.name);
            formData.append('description', newSong.description);
            formData.append('genre', newSong.genre);
            formData.append('bpm', newSong.bpm);
            formData.append('tom', newSong.tom);
            formData.append('duration', newSong.duration);
            formData.append('audio', newSong.audio);

            try 
            {
                const response = await fetch(`${apiUrl}/songs`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });

                if (response.ok) 
                {
                    const song = await response.json();
                    setSongs(prev => [...prev, song]);
                    setShowModal(false);
                    setNewSong({ name: '', description: '', genre: '', bpm: '', tom: '', duration: '', audio: null });
                }
            } 
            catch (error) 
            {
                console.error(error);
            }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#0f1c2e] to-[#0a1424] text-white px-6 py-6 ">

            <header className="flex justify-between items-center mb-8">
                <div className="flex flex-col">
                <h1 className="text-4xl font-extrabold text-emerald-400 drop-shadow-lg neon-text"> Melodize </h1>
                <p className="text-gray-300">Crie suas melodias sobre playbacks profissionais</p>
                </div>
                <div className="flex gap-4">
                {user && user?.profile === 'admin' && (
                <button onClick={() => setShowModal(true)}
                    className="bg-emerald-400 text-white px-4 py-2 rounded-md hover:bg-emerald-600 transition">
                    + Adicionar Música
                </button>
                )}
                <button onClick={() => navigate(`/songs/1/recordings`)}
                    className="bg-emerald-400 text-white px-4 py-2 rounded-md hover:bg-emerald-600 transition">
                    Suas Gravações
                </button>
                <button onClick={handleLogout}
                    className="bg-black px-4 py-2 rounded-md hover:bg-red-600 transition">
                    Sair
                </button>
                </div>
            </header>

            {/* Filtros e busca */}
            <section className="bg-black/60 rounded-xl p-4 flex flex-wrap gap-3 items-center mb-6 shadow shadow-emerald-400">
                <input
                type="text"
                placeholder="Buscar playbacks por título"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 min-w-[200px] px-4 py-2 bg-black/40 border border-gray-700 rounded-md focus:outline-none focus:border-emerald-400"
                />
                <div className="flex flex-wrap gap-2">
                {genreButtons.map((label, i) => {
                    const genre = label.split(' (')[0];
                    return (
                    <button key={i}  onClick={() => setSelectedGenre(genre)}
                        className={`px-4 py-2 rounded-lg border text-white transition
                        ${selectedGenre === genre ? 'bg-emerald-400 border-emerald-400 text-black' : 'bg-black border-gray-700 hover:bg-emerald-400 hover:text-black'}`}>
                        <strong>{label}</strong>
                    </button>
                    );
                })}
                </div>
            </section>

            {/* Contadores */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-black/60 rounded-xl p-6 text-start shadow shadow-emerald-400">
                <p className="text-gray-300">Playbacks Disponíveis</p>
                <p className="text-4xl font-bold text-emerald-400 neon-text">{songs.length}</p>       
                </div>
                <div className="bg-black/60 rounded-xl p-6 text-start shadow shadow-emerald-400">
                <p className="text-gray-300">Estilos Musicais</p>
                <p className="text-4xl font-bold text-emerald-400 neon-text">{totalGenres}</p>        
                </div>
                <div className="bg-black/60 rounded-xl p-6 text-start shadow shadow-emerald-400">
                <p className="text-gray-300">Suas Composições</p>
                <p className="text-4xl font-bold text-emerald-400 neon-text">{recordings.length}</p>      
                </div>
            </div>

            {/* Lista de playbacks */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl my-6 font-bold">Todos os Playbacks</h2>
                <span>{songs.length} encontrados</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {filteredSongs.map((song) => (
                <div key={song.id}
                    className="bg-black/60 rounded-xl p-5 flex flex-col justify-between shadow shadow-emerald-400">
                    <div>            
                    <h3 className="text-lg font-bold my-2">{song.name}</h3>
                    <span className="text-white text-xs border border-gray-400 rounded-xl py-1 px-2">🎵 {song.genre}</span>
                    <p className="text-gray-300 mt-8 mb-2">{song.description}</p>
                    <div className="flex justify-between text-gray-300 text-sm">
                        <p><strong>BPM:</strong> {song.bpm}</p>
                        <p><strong>Tom:</strong> {song.tom}</p>
                        <p><strong>Duração:</strong> {song.duration}</p>
                    </div>
                    </div>
                    <div className="flex flex-col gap-2">
                    <button onClick={() => handleNewRecording(song.id)}
                        className="mt-4 bg-emerald-400 text-black py-2 rounded-lg font-semibold hover:bg-emerald-500 transition o">
                        Compor Melodia
                    </button>
                    {user && user?.profile === 'admin' && (
                    <button onClick={() => handleDeleteSong(song.id)}
                        className="bg-red-400 text-black py-2 rounded-lg font-semibold hover:bg-red-500 transition o">
                        Excluir Melodia
                    </button>
                    )}
                    </div>
                </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-stone-900 rounded-lg p-6 w-full max-w-lg">
                    <h2 className="text-xl font-bold text-white mb-4">Adicionar Nova Música</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                        <label className="block text-stone-300 mb-2">Nome</label>
                        <input type="text" name="name" value={newSong.name} onChange={handleInputChange} required
                            className="w-full p-2 rounded bg-stone-800 text-white border border-stone-700" />
                        </div>
                        <div className="mb-4">
                        <label className="block text-stone-300 mb-2">Descrição</label>
                        <input type="text" name="description" value={newSong.description} onChange={handleInputChange} required
                            className="w-full p-2 rounded bg-stone-800 text-white border border-stone-700" />
                        </div>
                        <div className="mb-4">
                        <label className="block text-stone-300 mb-2">Gênero</label>
                        <input type="text" name="genre" value={newSong.genre} onChange={handleInputChange} required
                            className="w-full p-2 rounded bg-stone-800 text-white border border-stone-700"/>
                        </div>              
                        <div className="flex gap-4">
                        <div className="mb-4">
                            <label className="block text-stone-300 mb-2">BPM</label>
                            <input type="text" name="bpm" value={newSong.bpm} onChange={handleInputChange} required
                            className="w-full p-2 rounded bg-stone-800 text-white border border-stone-700"/>
                        </div>
                        <div className="mb-4">
                            <label className="block text-stone-300 mb-2">Tom</label>
                            <input type="text" name="tom" value={newSong.tom} onChange={handleInputChange} required
                            className="w-full p-2 rounded bg-stone-800 text-white border border-stone-700"/>
                        </div>
                        <div className="mb-4">
                            <label className="block text-stone-300 mb-2">Duração</label>
                            <input type="text" name="duration" value={newSong.duration} onChange={handleInputChange} required placeholder='Ex: 03:45'
                            className="w-full p-2 rounded bg-stone-800 text-white border border-stone-700"/>
                        </div>
                        </div>                           
                        <div className="mb-6">
                        <label className="block text-stone-300 mb-2">Arquivo de Áudio</label>
                        <input type="file" accept="audio/*" onChange={handleFileChange} required
                            className="w-full p-2 rounded bg-stone-800 text-white border border-stone-700"/>
                        </div>
                        <div className="flex justify-end gap-4">
                        <button type="button" onClick={() => setShowModal(false)}
                            className="px-4 py-2 text-white bg-stone-700 rounded hover:bg-stone-600 transition-colors">
                            Cancelar
                        </button>
                        <button type="submit"
                            className="px-4 py-2 text-white bg-emerald-500 rounded hover:bg-emerald-600 transition-colors">
                            Salvar
                        </button>
                        </div>
                    </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SongList;
import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import cors from 'cors';

import dotenv from 'dotenv';
dotenv.config();

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

const corsOptions = 
{
    origin: ['http://localhost:5173', 'http://localhost:3000', 'https://melodize-backend.gj8pu6.easypanel.host'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
app.use(cors(corsOptions));

app.use((req, res, next) => 
{
    if (req.method === 'OPTIONS') 
    {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        res.header('Access-Control-Allow-Credentials', 'true');
        return res.sendStatus(204);
    }
    next();
});

app.use(express.json());

app.use('/uploads', express.static('uploads'));
app.use(express.static(path.join(__dirname, 'dist')));

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const storage = multer.diskStorage({ 
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});

const upload = multer({ storage });

const authenticateToken = (req, res, next) => 
{
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => 
    {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

app.post('/api/register', async (req, res) => 
{
    try 
    {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await db.execute('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);
        
        res.status(201).json({ message: 'User registered successfully' });
    } 
    catch (error) 
    {
        console.error(error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/login', async (req, res) => 
{
    try 
    {
        const { email, password } = req.body;
        
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        
        const user = rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '1d' }
        );
        
        res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } 
    catch (error) 
    {
        console.error(error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/songs', authenticateToken, upload.single('audio'), async (req, res) => 
{
    try 
    {
        const { name, description, genre, bpm, tom, duration } = req.body;
        const audioPath = req.file.path;
        const userId = req.user.id;
        
        const [result] = await db.execute('INSERT INTO songs (name, description, genre, bpm, tom, duration, audio_path, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
            [name, description, genre, bpm, tom, duration, audioPath, userId]);
        
        res.status(201).json({ id: result.insertId, name, description, genre, bpm, tom, duration, audioPath });
    } 
    catch (error) 
    {
        console.error(error);
        res.status(500).json({ error: 'Failed to save song' });
    }
});

app.get('/api/songs', authenticateToken, async (req, res) => 
{
    try 
    {
        const [rows] = await db.execute('SELECT * FROM songs');
        res.json(rows);
    } 
    catch (error) 
    {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch songs' });
    }
});

app.get('/api/songs/:id', authenticateToken, async (req, res) => 
{
    try 
    {
        const { id } = req.params;
        
        const [rows] = await db.execute('SELECT * FROM songs WHERE id = ?', [id]);
        
        if (rows.length === 0) return res.status(404).json({ error: 'Song not found' });
        
        res.json(rows);
    } 
    catch (error) 
    {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch song' });
    }
});

app.delete('/api/songs/:id', authenticateToken, async (req, res) => 
{
    try 
    {
        const { id } = req.params;
        const userId = req.user.id;

        const [check] = await db.execute('SELECT * FROM songs WHERE id = ? AND user_id = ?',[id, userId]);

        if (check.length === 0) return res.status(404).json({ error: 'Música não encontrada ou não pertence ao usuário' });

        const [result] = await db.execute('DELETE FROM songs WHERE id = ? AND user_id = ?', [id, userId]);

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Nenhuma música foi deletada' });

        res.json({ success: true, message: 'Música deletada com sucesso' });
    } 
    catch (error) 
    {
        console.error('Erro ao deletar música:', error);
        res.status(500).json({ error: 'Erro ao deletar música' });
    }
});

app.get('/api/recordings', authenticateToken, async (req, res) => 
{
    try 
    {
        const userId = req.user.id;
        const [rows] = await db.execute('SELECT id FROM recordings WHERE user_id = ?', [userId]);
        res.json(rows);
    } 
    catch (error) 
    {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
});

app.get('/api/recordings/all', authenticateToken, async (req, res) => 
{
    try 
    {
        const userId = req.user.id;
        const [rows] = await db.execute('SELECT * FROM recordings WHERE user_id = ?', [userId]);
        res.json(rows);
    } 
    catch (error) 
    {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
});

app.post('/api/recordings', authenticateToken, upload.single('audio'), async (req, res) => 
{
    try 
    {
        const name = req.body.name || 'Gravação sem nome';
        const song_id = req.body.song_id ? parseInt(req.body.song_id) : null;
        const userId = req.user.id;
        const audio_path = req.file ? req.file.path : null;

        if (!song_id || !audio_path) { return res.status(400).json({ error: 'Dados incompletos' }); }
        
        const [result] = await db.execute('INSERT INTO recordings (name, audio_path, song_id, user_id) VALUES (?, ?, ?, ?)', [name, audio_path, song_id, userId]);
        
        res.status(201).json({ id: result.insertId, name, audio_path, song_id });
    } 
    catch (error) 
    {
        console.error(error);
        res.status(500).json({ error: 'Failed to save recording' });
    }
});

app.get('/api/recordings/id/:recording_id/', authenticateToken, async (req, res) => 
{
    try 
    {
        const { recording_id } = req.params;
        const userId = req.user.id;
        
        const [rows] = await db.execute('SELECT * FROM recordings WHERE id = ? AND user_id = ?', [recording_id, userId]);
        
        res.json(rows);
    } 
    catch (error) 
    {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
});

app.get('/api/recordings/:song_id', authenticateToken, async (req, res) => 
{
    try 
    {
        const { song_id } = req.params;
        const userId = req.user.id;
        
        const [rows] = await db.execute('SELECT * FROM recordings WHERE song_id = ? AND user_id = ?', [song_id, userId]);
        
        res.json(rows);
    } 
    catch (error) 
    {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
});

app.put('/api/recordings/:id', authenticateToken, upload.single('audio'), async (req, res) => 
{
    try 
    {
        const { id } = req.params;
        const { name } = req.body;
        const audioPath = req.file?.path;
        const userId = req.user.id;
        
        let query = 'UPDATE recordings SET name = ?';
        const params = [name];
        
        if (audioPath) 
        {
            query += ', audio_path = ?';
            params.push(audioPath);
        }
        
        query += ' WHERE id = ? AND user_id = ?';
        params.push(id, userId);
        
        const [result] = await db.execute(query, params);
        
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Recording not found' });
        
        res.json({ id, name, audioPath });
    } 
    catch (error) 
    {
        console.error(error);
        res.status(500).json({ error: 'Failed to update recording' });
    }
});

app.delete('/api/recordings/:id', authenticateToken, async (req, res) => 
{
    try 
    {
        const { id } = req.params;
        const userId = req.user.id;

        const [check] = await db.execute('SELECT * FROM recordings WHERE id = ? AND user_id = ?',[id, userId]);

        if (check.length === 0) return res.status(404).json({ error: 'Gravação não encontrada ou não pertence ao usuário' });

        const [result] = await db.execute('DELETE FROM recordings WHERE id = ? AND user_id = ?', [id, userId]);

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Nenhuma gravação foi deletada' });

        res.json({ success: true, message: 'Gravação deletada com sucesso' });
    } 
    catch (error) 
    {
        console.error('Erro ao deletar gravação:', error);
        res.status(500).json({ error: 'Erro ao deletar gravação' });
    }
});

app.use((req, res, next) => 
{
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
    
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => { console.log(`Server running on port ${PORT}`); });

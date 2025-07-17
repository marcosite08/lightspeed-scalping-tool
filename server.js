const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        message: '✅ Servidor funcionando en Railway',
        timestamp: new Date().toISOString()
    });
});

// API básica
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '✅ API funcionando correctamente',
        environment: 'Railway',
        timestamp: new Date().toISOString()
    });
});

// Datos simulados
app.get('/api/closures', (req, res) => {
    const { date } = req.query;
    
    const closures = [
        {
            id: '020b2c2a-46fb-11f0-e88b-5d184126b98d',
            outlet: 'Bacanton',
            date: date || '2025-07-09',
            sales: 1250.50,
            payments: 1250.50,
            url: 'https://construmas.retail.lightspeed.app/register/closure/summary/020b2c2a-46fb-11f0-e88b-5d184126b98d'
        },
        {
            id: '020b2c2a-46fb-11f0-e88b-5cbf65706cc7',
            outlet: 'Bacanton',
            date: date || '2025-07-09',
            sales: 850.75,
            payments: 850.75,
            url: 'https://construmas.retail.lightspeed.app/register/closure/summary/020b2c2a-46fb-11f0-e88b-5cbf65706cc7'
        },
        {
            id: '020b2c2a-46fb-11f0-e88b-5cbe47b6a531',
            outlet: 'Matriz Mazapa',
            date: date || '2025-07-09',
            sales: 450.25,
            payments: 450.25,
            url: 'https://construmas.retail.lightspeed.app/register/closure/summary/020b2c2a-46fb-11f0-e88b-5cbe47b6a531'
        }
    ];
    
    res.json({
        success: true,
        data: closures,
        total: closures.length,
        date: date || '2025-07-09'
    });
});

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

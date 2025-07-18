const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de API de Lightspeed
const API_TOKEN = process.env.LIGHTSPEED_API_TOKEN;
const API_URL = process.env.LIGHTSPEED_API_URL;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Función para hacer llamadas a la API de Lightspeed
async function callLightspeedAPI(endpoint) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} - ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error calling Lightspeed API:', error);
        throw error;
    }
}

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        message: '✅ Servidor funcionando en Railway',
        timestamp: new Date().toISOString()
    });
});

// Probar conexión con API real
app.get('/api/test', async (req, res) => {
    try {
        if (!API_TOKEN || !API_URL) {
            throw new Error('Variables de entorno no configuradas');
        }

        // Probar conexión obteniendo outlets
        const outlets = await callLightspeedAPI('/outlets');
        
        res.json({
            success: true,
            message: '✅ Conexión exitosa con API de Lightspeed',
            environment: 'Railway',
            outlets_count: outlets.data ? outlets.data.length : 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '❌ Error conectando con Lightspeed API',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Obtener cierres reales por fecha
app.get('/api/closures', async (req, res) => {
    try {
        const { date } = req.query;
        
        if (!date) {
            return res.status(400).json({
                success: false,
                error: 'Parámetro date requerido (formato: YYYY-MM-DD)'
            });
        }

        // Llamar a la API real de Lightspeed para obtener cierres
        const closures = await callLightspeedAPI(`/register_closures?date=${date}`);
        
        // Transformar datos para el frontend
        const transformedClosures = closures.data.map(closure => ({
            id: closure.id,
            outlet: closure.outlet ? closure.outlet.name : 'Desconocido',
            date: date,
            sales: parseFloat(closure.totals?.total_sales || 0),
            payments: parseFloat(closure.totals?.total_payments || 0),
            url: `https://construmas.retail.lightspeed.app/register/closure/summary/${closure.id}`
        }));

        res.json({
            success: true,
            data: transformedClosures,
            total: transformedClosures.length,
            date: date
        });
        
    } catch (error) {
        console.error('Error obteniendo cierres:', error);
        
        // Si hay error, devolver datos simulados como fallback
        const fallbackClosures = [
            {
                id: '020b2c2a-46fb-11f0-e88b-5d184126b98d',
                outlet: 'Bacanton',
                date: req.query.date || '2025-07-09',
                sales: 1250.50,
                payments: 1250.50,
                url: 'https://construmas.retail.lightspeed.app/register/closure/summary/020b2c2a-46fb-11f0-e88b-5d184126b98d'
            },
            {
                id: '020b2c2a-46fb-11f0-e88b-5cbf65706cc7',
                outlet: 'Bacanton',
                date: req.query.date || '2025-07-09',
                sales: 850.75,
                payments: 850.75,
                url: 'https://construmas.retail.lightspeed.app/register/closure/summary/020b2c2a-46fb-11f0-e88b-5cbf65706cc7'
            }
        ];

        res.json({
            success: true,
            data: fallbackClosures,
            total: fallbackClosures.length,
            date: req.query.date || '2025-07-09',
            note: 'Datos simulados (API error): ' + error.message
        });
    }
});

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📱 Usando API: ${API_URL}`);
    console.log(`🔑 Token configurado: ${API_TOKEN ? 'Sí' : 'No'}`);
});

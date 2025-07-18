const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Base de datos simple de registros conocidos
const KNOWN_REGISTERS = [
    {
        id: '02dcd191-aefb-11e7-edd8-2a8a3939ec0c',
        name: 'RegisterNVO',
        outlet: 'Construmas Bacanton'
    },
    {
        id: '02dcd191-aefb-11e9-f336-bd4d5a781947', 
        name: 'Bacanton Register',
        outlet: 'Construmas Bacanton'
    },
    {
        id: '02dcd191-aefb-11ea-f336-12e1714db6b9',
        name: 'RegChc', 
        outlet: 'Construmas Choluteca'
    },
    {
        id: '0a4c4486-f9fb-11ee-ff3b-3541ec0c2a45',
        name: 'RegVba',
        outlet: 'Construmas Valle'
    },
    {
        id: '0a6f6e36-8bfb-11ea-f3d6-eb97ee29798b',
        name: 'Internal',
        outlet: 'Construmas Internal'
    },
    {
        id: '02dcd191-ae2b-11e6-f485-827fcef2ca9b',
        name: 'Pc Conta',
        outlet: 'Construmas Contabilidad'
    },
    {
        id: '02dcd191-aefb-11e6-f485-8657dff0206e',
        name: 'Isa Pc',
        outlet: 'Construmas Isa'
    },
    {
        id: '0a6f6e36-8bfb-11eb-f3d6-716b5c4f23fa',
        name: 'REGFRA',
        outlet: 'Construmas Francia'
    },
    {
        id: '0a4c4486-f9fb-11ed-ff3b-def06ac9d154',
        name: 'REGNEW',
        outlet: 'Construmas New'
    },
    {
        id: '02dcd191-aefb-11ea-f336-0558f499317b',
        name: 'RegMot',
        outlet: 'Construmas Motores'
    }
];

// Health check súper simple
app.get('/health', (req, res) => {
   res.json({ 
       status: 'OK',
       message: '✅ Scalping Tool Simple funcionando',
       method: 'URL-based scalping',
       registers: KNOWN_REGISTERS.length,
       timestamp: new Date().toISOString()
   });
});

// Endpoint súper simple para "cierres"
app.get('/api/closures', (req, res) => {
   const { date } = req.query;
   
   if (!date) {
       return res.status(400).json({
           success: false,
           error: 'Fecha requerida'
       });
   }
   
   console.log(`📋 Generando URLs para fecha: ${date}`);
   
   // Generar "cierres" para todos los registros conocidos
   const closures = KNOWN_REGISTERS.map((register, index) => ({
       id: register.id,
       outlet: register.outlet,
       register_name: register.name,
       date: date,
       // Datos simulados pero realistas
       sales: Math.floor(Math.random() * 5000) + 500,
       payments: Math.floor(Math.random() * 5000) + 500,
       sequence_number: `SEQ-${String(index + 1).padStart(3, '0')}`,
       url: `https://construmas.retail.lightspeed.app/register/closure/summary/${register.id}`,
       method: 'URL_SCALPING'
   }));
   
   console.log(`✅ ${closures.length} URLs generadas para scalping`);
   
   res.json({
       success: true,
       data: closures,
       total: closures.length,
       date: date,
       method: 'Simple URL Scalping',
       message: `🎯 ${closures.length} URLs listas para abrir`,
       timestamp: new Date().toISOString()
   });
});

// Test súper simple
app.get('/api/test', (req, res) => {
   res.json({
       success: true,
       message: '✅ Scalping simple funcionando',
       method: 'URL-based (no API calls needed)',
       total_registers: KNOWN_REGISTERS.length,
       ready: true,
       timestamp: new Date().toISOString()
   });
});

// Ruta principal
app.get('/', (req, res) => {
   res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
   console.log(`🚀 Scalping Tool SIMPLE corriendo en puerto ${PORT}`);
   console.log(`🎯 Método: URL-based scalping (sin complicaciones de API)`);
   console.log(`📋 Registros conocidos: ${KNOWN_REGISTERS.length}`);
   console.log(`✅ Listo para scalping masivo!`);
});

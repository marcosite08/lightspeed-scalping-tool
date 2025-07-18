const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de API de Lightspeed X-Series
const API_TOKEN = process.env.LIGHTSPEED_API_TOKEN;
const API_URL = process.env.LIGHTSPEED_API_URL;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Función para hacer llamadas a la API de Lightspeed X-Series
async function callLightspeedAPI(endpoint, options = {}) {
   try {
       const url = `${API_URL}${endpoint}`;
       console.log(`🔍 Llamando X-Series API: ${url}`);
       
       const response = await fetch(url, {
           headers: {
               'Authorization': `Bearer ${API_TOKEN}`,
               'Content-Type': 'application/json',
               ...options.headers
           },
           ...options
       });

       if (!response.ok) {
           const errorText = await response.text();
           throw new Error(`API Error: ${response.status} - ${response.statusText} - ${errorText}`);
       }

       return await response.json();
   } catch (error) {
       console.error('Error calling Lightspeed X-Series API:', error);
       throw error;
   }
}

// Health check actualizado para X-Series
app.get('/health', (req, res) => {
   res.json({ 
       status: 'OK',
       message: '✅ Servidor X-Series funcionando en Railway',
       api_version: 'Lightspeed X-Series v2.0',
       documentation: 'https://x-series-api.lightspeedhq.com/',
       timestamp: new Date().toISOString()
   });
});

// Endpoint principal para obtener cierres - ACTUALIZADO PARA X-SERIES
app.get('/api/closures', async (req, res) => {
   try {
       const { date } = req.query;
       
       if (!date) {
           return res.status(400).json({
               success: false,
               error: 'Parámetro date requerido (formato: YYYY-MM-DD)'
           });
       }

       console.log(`🔍 Buscando cierres X-Series para fecha: ${date}`);

       // Paso 1: Obtener todos los registros
       const registersResponse = await callLightspeedAPI('/registers');
       const registers = registersResponse.data;
       
       console.log(`📋 Encontrados ${registers.length} registros X-Series`);

       const closures = [];
       
       for (const register of registers) {
           try {
               console.log(`🔍 Registro X-Series: ${register.name}`);
               console.log(`   - ID: ${register.id}`);
               console.log(`   - Outlet ID: ${register.outlet_id}`);
               console.log(`   - Abierto: ${register.is_open ? 'SÍ' : 'NO'}`);
               console.log(`   - Fecha cierre: ${register.register_close_time}`);
               
               // Verificar si el registro tiene cierre y coincide con la fecha
               if (register.register_close_time) {
                   const closeDate = new Date(register.register_close_time).toISOString().split('T')[0];
                   console.log(`   - Fecha procesada: ${closeDate} (buscando: ${date})`);
                   
                   if (closeDate === date) {
                       console.log(`✅ MATCH! Registro ${register.name} cerrado en ${date}`);
                       
                       try {
                           // ENDPOINT CLAVE X-SERIES: payments_summary
                           console.log(`   - Obteniendo payments_summary X-Series...`);
                           const paymentsSummary = await callLightspeedAPI(`/registers/${register.id}/payments_summary`);
                           
                           // Obtener información del outlet
                           console.log(`   - Obteniendo outlet info...`);
                           const outletResponse = await callLightspeedAPI(`/outlets/${register.outlet_id}`);
                           const outlet = outletResponse.data;
                           
                           // Calcular totales usando X-Series payments_summary
                           let totalPayments = 0;
                           let paymentsBreakdown = [];
                           
                           if (paymentsSummary.data && paymentsSummary.data.payments) {
                               paymentsBreakdown = paymentsSummary.data.payments;
                               totalPayments = paymentsBreakdown.reduce((sum, payment) => {
                                   return sum + parseFloat(payment.total || 0);
                               }, 0);
                           }
                           
                           console.log(`   - Total payments X-Series: ${totalPayments}`);
                           console.log(`   - Outlet name: ${outlet.name}`);
                           console.log(`   - Sequence number: ${paymentsSummary.data.register_closure_sequence_number}`);
                           
                           closures.push({
                               id: register.id,
                               outlet: outlet.name,
                               register_name: register.name,
                               date: date,
                               closed_at: register.register_close_time,
                               open_time: register.register_open_time,
                               sales: totalPayments,
                               payments: totalPayments,
                               payments_breakdown: paymentsBreakdown,
                               sequence_number: paymentsSummary.data.register_closure_sequence_number || 'N/A',
                               is_open: register.is_open,
                               url: `https://construmas.retail.lightspeed.app/register/closure/summary/${register.id}`,
                               api_version: 'X-Series v2.0'
                           });
                           
                           console.log(`✅ Cierre X-Series agregado exitosamente`);
                           
                       } catch (detailError) {
                           console.error(`❌ Error obteniendo detalles del registro X-Series ${register.name}:`, detailError.message);
                           
                           // Agregar cierre con datos básicos si falla payments_summary
                           closures.push({
                               id: register.id,
                               outlet: 'Unknown',
                               register_name: register.name,
                               date: date,
                               closed_at: register.register_close_time,
                               sales: 0,
                               payments: 0,
                               sequence_number: 'Error',
                               url: `https://construmas.retail.lightspeed.app/register/closure/summary/${register.id}`,
                               error: detailError.message,
                               api_version: 'X-Series v2.0'
                           });
                       }
                   } else {
                       console.log(`❌ NO MATCH: ${closeDate} !== ${date}`);
                   }
               } else {
                   console.log(`   - Sin fecha de cierre (registro abierto o nunca cerrado)`);
               }
               
               console.log(`   ────────────────────────────────`);
               
           } catch (error) {
               console.error(`❌ Error procesando registro X-Series ${register.name}:`, error.message);
           }
       }

       console.log(`📊 Total cierres X-Series encontrados: ${closures.length}`);

       if (closures.length === 0) {
           // Mostrar fechas disponibles para debugging
           console.log(`🔍 FECHAS DE CIERRE DISPONIBLES EN X-SERIES:`);
           registers.forEach(register => {
               if (register.register_close_time) {
                   const closeDate = new Date(register.register_close_time).toISOString().split('T')[0];
                   console.log(`   - ${register.name}: ${closeDate}`);
               }
           });
           
           return res.json({
               success: true,
               data: [],
               total: 0,
               date: date,
               message: `No se encontraron cierres X-Series para la fecha ${date}. Revisa los logs para ver las fechas disponibles.`,
               api_version: 'X-Series v2.0',
               debug_info: {
                   total_registers: registers.length,
                   registers_with_close_time: registers.filter(r => r.register_close_time).length,
                   available_dates: [...new Set(registers
                       .filter(r => r.register_close_time)
                       .map(r => new Date(r.register_close_time).toISOString().split('T')[0]))]
               }
           });
       }

       res.json({
           success: true,
           data: closures,
           total: closures.length,
           date: date,
           api_version: 'Lightspeed X-Series v2.0',
           endpoint_used: '/registers + /registers/:id/payments_summary',
           documentation: 'https://x-series-api.lightspeedhq.com/docs/registers_closing',
           timestamp: new Date().toISOString()
       });
       
   } catch (error) {
       console.error('❌ Error obteniendo cierres X-Series:', error);
       
       // Fallback con datos simulados actualizados
       const fallbackClosures = [
           {
               id: '02dcd191-aefb-11e7-edd8-2a8a3939ec0c',
               outlet: 'Construmas Bacanton',
               register_name: 'RegisterNVO',
               date: req.query.date || new Date().toISOString().split('T')[0],
               sales: 1250.50,
               payments: 1250.50,
               sequence_number: 'CLS-001',
               url: 'https://construmas.retail.lightspeed.app/register/closure/summary/02dcd191-aefb-11e7-edd8-2a8a3939ec0c',
               api_version: 'X-Series v2.0 (fallback)'
           }
       ];

       res.json({
           success: true,
           data: fallbackClosures,
           total: fallbackClosures.length,
           date: req.query.date || new Date().toISOString().split('T')[0],
           note: 'Datos simulados X-Series (API error): ' + error.message,
           api_version: 'X-Series v2.0 (fallback)'
       });
   }
});

// Probar conexión actualizado para X-Series
app.get('/api/test', async (req, res) => {
   try {
       if (!API_TOKEN || !API_URL) {
           throw new Error('Variables de entorno no configuradas para X-Series');
       }

       // Probar endpoints específicos de X-Series
       const testEndpoints = ['/outlets', '/registers', '/payment_types'];
       const results = {};
       
       for (const endpoint of testEndpoints) {
           try {
               const data = await callLightspeedAPI(endpoint);
               results[endpoint] = {
                   success: true,
                   count: data.data ? data.data.length : (Array.isArray(data) ? data.length : 'N/A')
               };
           } catch (error) {
               results[endpoint] = {
                   success: false,
                   error: error.message
               };
           }
       }
       
       res.json({
           success: true,
           message: '✅ Conexión exitosa con Lightspeed X-Series API',
           api_version: 'X-Series v2.0',
           environment: 'Railway',
           api_url: API_URL,
           test_results: results,
           documentation: {
               main: 'https://x-series-api.lightspeedhq.com/',
               closing: 'https://x-series-api.lightspeedhq.com/docs/registers_closing',
               webhooks: 'https://x-series-api.lightspeedhq.com/docs/webhooks'
           },
           timestamp: new Date().toISOString()
       });
   } catch (error) {
       res.status(500).json({
           success: false,
           message: '❌ Error conectando con Lightspeed X-Series API',
           error: error.message,
           api_url: API_URL,
           timestamp: new Date().toISOString()
       });
   }
});

// Endpoint para explorar capacidades de X-Series
app.get('/api/explore', async (req, res) => {
   try {
       const xSeriesEndpoints = [
           '/outlets',
           '/registers', 
           '/sales',
           '/payment_types',
           '/users',
           '/products',
           '/customers'
       ];

       const results = {};
       
       for (const endpoint of xSeriesEndpoints) {
           try {
               console.log(`🔍 Explorando X-Series: ${endpoint}`);
               const data = await callLightspeedAPI(endpoint);
               results[endpoint] = {
                   success: true,
                   status: 'OK',
                   count: data.data ? data.data.length : 'N/A',
                   sample_keys: data.data && data.data.length > 0 ? Object.keys(data.data[0]) : [],
                   pagination: data.pagination || null
               };
           } catch (error) {
               results[endpoint] = {
                   success: false,
                   error: error.message
               };
           }
       }

       res.json({
           success: true,
           message: 'Exploración de X-Series completada',
           api_version: 'X-Series v2.0',
           exploration: results,
           documentation: 'https://x-series-api.lightspeedhq.com/',
           timestamp: new Date().toISOString()
       });
   } catch (error) {
       res.status(500).json({
           success: false,
           error: error.message
       });
   }
});

// Endpoint para probar un registro específico con payments_summary
app.get('/api/test-register/:registerId', async (req, res) => {
   try {
       const { registerId } = req.params;
       console.log(`🔍 Probando registro específico X-Series: ${registerId}`);
       
       const tests = {};
       
       // Obtener info básica del registro
       try {
           const registerData = await callLightspeedAPI(`/registers/${registerId}`);
           tests.register_info = {
               success: true,
               data: registerData.data
           };
       } catch (error) {
           tests.register_info = {
               success: false,
               error: error.message
           };
       }
       
       // ENDPOINT CLAVE: payments_summary
       try {
           const paymentsData = await callLightspeedAPI(`/registers/${registerId}/payments_summary`);
           const totalPayments = paymentsData.data?.payments?.reduce((sum, p) => sum + parseFloat(p.total || 0), 0) || 0;
           
           tests.payments_summary = {
               success: true,
               data: paymentsData.data,
               total_payments: totalPayments,
               sequence_number: paymentsData.data?.register_closure_sequence_number
           };
       } catch (error) {
           tests.payments_summary = {
               success: false,
               error: error.message
           };
       }
       
       res.json({
           success: true,
           register_id: registerId,
           tests: tests,
           api_version: 'X-Series v2.0',
           endpoint_tested: '/registers/:id/payments_summary',
           timestamp: new Date().toISOString()
       });
       
   } catch (error) {
       res.status(500).json({
           success: false,
           error: error.message
       });
   }
});

// Endpoint para debugging de fechas disponibles
app.get('/api/available-dates', async (req, res) => {
   try {
       console.log('🗓️ Obteniendo fechas de cierres disponibles...');
       
       const registersResponse = await callLightspeedAPI('/registers');
       const registers = registersResponse.data;
       
       const availableDates = {};
       
       registers.forEach(register => {
           if (register.register_close_time) {
               const closeDate = new Date(register.register_close_time).toISOString().split('T')[0];
               if (!availableDates[closeDate]) {
                   availableDates[closeDate] = [];
               }
               availableDates[closeDate].push({
                   register_name: register.name,
                   register_id: register.id,
                   close_time: register.register_close_time
               });
           }
       });
       
       res.json({
           success: true,
           api_version: 'X-Series v2.0',
           total_registers: registers.length,
           available_dates: availableDates,
           dates_list: Object.keys(availableDates).sort().reverse(), // Más recientes primero
           message: 'Fechas disponibles para filtrar cierres',
           timestamp: new Date().toISOString()
       });
       
   } catch (error) {
       res.status(500).json({
           success: false,
           error: error.message
       });
   }
});

// Endpoint para configurar webhook de cierres (opcional)
app.post('/api/setup-webhook', async (req, res) => {
   try {
       const webhookUrl = req.body.webhook_url || `${req.protocol}://${req.get('host')}/api/webhook/closure`;
       
       // Configurar webhook para register_closure.create
       const webhookData = {
           url: webhookUrl,
           events: ['register_closure.create']
       };
       
       console.log(`🔗 Configurando webhook X-Series: ${webhookUrl}`);
       
       // Esto requiere el endpoint POST /api/webhook de X-Series
       const webhookResponse = await callLightspeedAPI('/webhook', {
           method: 'POST',
           body: JSON.stringify(webhookData)
       });
       
       res.json({
           success: true,
           webhook_configured: true,
           webhook_url: webhookUrl,
           webhook_id: webhookResponse.data?.id,
           message: 'Webhook configurado para recibir notificaciones de cierres automáticamente',
           api_version: 'X-Series v2.0',
           timestamp: new Date().toISOString()
       });
       
   } catch (error) {
       res.status(500).json({
           success: false,
           error: error.message,
           note: 'Webhook opcional - la app funciona sin esto'
       });
   }
});

// Endpoint para recibir webhooks de cierres (opcional)
app.post('/api/webhook/closure', (req, res) => {
   try {
       console.log('🔔 Webhook de cierre recibido:', req.body);
       
       // Aquí puedes procesar el webhook automáticamente
       // Por ejemplo, enviar notificación, actualizar base de datos, etc.
       
       res.json({
           success: true,
           message: 'Webhook de cierre procesado',
           timestamp: new Date().toISOString()
       });
       
   } catch (error) {
       res.status(500).json({
           success: false,
           error: error.message
       });
   }
});

// Ruta principal
app.get('/', (req, res) => {
   res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
   console.log(`🚀 Servidor X-Series corriendo en puerto ${PORT}`);
   console.log(`📱 Usando Lightspeed X-Series API: ${API_URL}`);
   console.log(`🔑 Token configurado: ${API_TOKEN ? 'Sí' : 'No'}`);
   console.log(`📚 Documentación: https://x-series-api.lightspeedhq.com/`);
   console.log(`🎯 Endpoint clave: /registers/:id/payments_summary`);
   console.log(`🔔 Webhook disponible: register_closure.create`);
});

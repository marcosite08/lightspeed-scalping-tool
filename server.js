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
       debug_endpoints: [
           '/api/debug-closures?date=YYYY-MM-DD',
           '/api/test-registernvo',
           '/api/available-dates'
       ],
       timestamp: new Date().toISOString()
   });
});

// 🔍 ENDPOINT DE DEBUGGING PRINCIPAL
app.get('/api/debug-closures', async (req, res) => {
   try {
       const { date } = req.query;
       console.log(`🔍 DEBUG: Buscando cierres para fecha: ${date}`);

       // Paso 1: Obtener todos los registros
       const registersResponse = await callLightspeedAPI('/registers');
       const registers = registersResponse.data;
       
       console.log(`📋 DEBUG: Total registros encontrados: ${registers.length}`);

       const debugInfo = [];
       const availableDates = new Set();
       let totalMatches = 0;
       let totalPaymentsSuccess = 0;
       
       for (const register of registers) {
           const registerDebug = {
               name: register.name,
               id: register.id,
               is_open: register.is_open,
               has_close_time: !!register.register_close_time,
               close_time: register.register_close_time,
               close_date: null,
               matches_search: false,
               payments_summary_test: null,
               outlet_id: register.outlet_id
           };
           
           console.log(`🔍 DEBUG: Procesando ${register.name} (${register.id})`);
           
           // Procesar fecha de cierre
           if (register.register_close_time) {
               try {
                   const closeDate = new Date(register.register_close_time).toISOString().split('T')[0];
                   registerDebug.close_date = closeDate;
                   availableDates.add(closeDate);
                   
                   console.log(`   📅 Fecha de cierre: ${closeDate}`);
                   
                   // Verificar si coincide con la búsqueda
                   if (date && closeDate === date) {
                       registerDebug.matches_search = true;
                       totalMatches++;
                       
                       console.log(`   ✅ MATCH encontrado para ${date}!`);
                       
                       // Probar payments_summary para este registro
                       try {
                           console.log(`   🔍 Probando payments_summary para ${register.name}`);
                           const paymentsData = await callLightspeedAPI(`/registers/${register.id}/payments_summary`);
                           
                           let totalPayments = 0;
                           if (paymentsData.data && paymentsData.data.payments) {
                               totalPayments = paymentsData.data.payments.reduce((sum, p) => sum + parseFloat(p.total || 0), 0);
                           }
                           
                           registerDebug.payments_summary_test = {
                               success: true,
                               total_payments: totalPayments,
                               sequence_number: paymentsData.data?.register_closure_sequence_number,
                               payments_count: paymentsData.data?.payments?.length || 0,
                               payments_breakdown: paymentsData.data?.payments || [],
                               full_data: paymentsData.data
                           };
                           
                           totalPaymentsSuccess++;
                           console.log(`   ✅ Payments summary OK - Total: ${totalPayments}, Secuencia: ${paymentsData.data?.register_closure_sequence_number}`);
                           
                       } catch (paymentsError) {
                           registerDebug.payments_summary_test = {
                               success: false,
                               error: paymentsError.message,
                               status_code: paymentsError.status
                           };
                           console.log(`   ❌ Error en payments_summary: ${paymentsError.message}`);
                       }
                   } else {
                       console.log(`   ❌ NO MATCH: ${closeDate} !== ${date}`);
                   }
               } catch (dateError) {
                   registerDebug.date_processing_error = dateError.message;
                   console.log(`   ❌ Error procesando fecha: ${dateError.message}`);
               }
           } else {
               console.log(`   ⚠️ Sin fecha de cierre`);
           }
           
           debugInfo.push(registerDebug);
       }

       // Análisis final
       const registersWithClosures = debugInfo.filter(r => r.has_close_time);
       const matchingRegisters = debugInfo.filter(r => r.matches_search);
       const successfulPayments = debugInfo.filter(r => r.payments_summary_test?.success);
       
       console.log(`📊 DEBUG RESUMEN FINAL:`);
       console.log(`   - Total registros: ${registers.length}`);
       console.log(`   - Con fechas de cierre: ${registersWithClosures.length}`);
       console.log(`   - Coinciden con búsqueda (${date}): ${matchingRegisters.length}`);
       console.log(`   - Payments summary exitoso: ${successfulPayments.length}`);
       console.log(`   - Fechas disponibles: ${Array.from(availableDates).sort().join(', ')}`);

       // Determinar el problema
       let problemIdentified = 'UNKNOWN';
       let recommendation = 'Revisar logs para más detalles';
       
       if (!date) {
           problemIdentified = 'NO_DATE_PROVIDED';
           recommendation = 'Proporciona una fecha en formato YYYY-MM-DD';
       } else if (availableDates.size === 0) {
           problemIdentified = 'NO_CLOSURES_EXIST';
           recommendation = 'No hay cierres en el sistema. Verifica que los registros se hayan cerrado.';
       } else if (matchingRegisters.length === 0) {
           problemIdentified = 'NO_MATCHING_DATE';
           recommendation = `La fecha ${date} no tiene cierres. Usa una de estas fechas: ${Array.from(availableDates).sort().reverse().slice(0, 5).join(', ')}`;
       } else if (successfulPayments.length === 0) {
           problemIdentified = 'PAYMENTS_SUMMARY_FAILS';
           recommendation = 'Los registros coinciden pero falla el endpoint payments_summary. Revisar permisos de API.';
       } else {
           problemIdentified = 'SUCCESS';
           recommendation = `✅ Todo funciona correctamente. ${successfulPayments.length} cierres encontrados.`;
       }

       res.json({
           success: true,
           debug_mode: true,
           search_date: date,
           problem_identified: problemIdentified,
           recommendation: recommendation,
           summary: {
               total_registers: registers.length,
               registers_with_closures: registersWithClosures.length,
               matching_registers: matchingRegisters.length,
               successful_payments: successfulPayments.length,
               available_dates_count: availableDates.size
           },
           available_dates: Array.from(availableDates).sort().reverse(),
           register_details: debugInfo,
           successful_closures: successfulPayments.map(r => ({
               id: r.id,
               name: r.name,
               close_date: r.close_date,
               total_payments: r.payments_summary_test?.total_payments,
               sequence_number: r.payments_summary_test?.sequence_number
           })),
           timestamp: new Date().toISOString()
       });
       
   } catch (error) {
       console.error('❌ DEBUG ERROR:', error);
       res.status(500).json({
           success: false,
           debug_mode: true,
           error: error.message,
           stack: error.stack,
           timestamp: new Date().toISOString()
       });
   }
});

// 🎯 ENDPOINT PARA PROBAR REGISTERNVO ESPECÍFICAMENTE
app.get('/api/test-registernvo', async (req, res) => {
   try {
       const registerNvoId = '02dcd191-aefb-11e7-edd8-2a8a3939ec0c';
       console.log(`🎯 PROBANDO REGISTERNVO ESPECÍFICAMENTE: ${registerNvoId}`);
       
       const tests = {};
       
       // 1. Info básica
       try {
           console.log(`   🔍 Obteniendo info básica del registro...`);
           const registerData = await callLightspeedAPI(`/registers/${registerNvoId}`);
           tests.basic_info = {
               success: true,
               data: registerData.data,
               close_time: registerData.data?.register_close_time,
               close_date: registerData.data?.register_close_time ? 
                   new Date(registerData.data.register_close_time).toISOString().split('T')[0] : null,
               is_open: registerData.data?.is_open,
               name: registerData.data?.name
           };
           console.log(`   ✅ Info básica OK: ${tests.basic_info.name}, Cerrado: ${tests.basic_info.close_date}`);
       } catch (error) {
           tests.basic_info = { success: false, error: error.message };
           console.log(`   ❌ Error info básica: ${error.message}`);
       }
       
       // 2. Payments Summary (ENDPOINT CLAVE)
       try {
           console.log(`   🔍 Probando payments_summary...`);
           const paymentsData = await callLightspeedAPI(`/registers/${registerNvoId}/payments_summary`);
           
           let totalPayments = 0;
           if (paymentsData.data && paymentsData.data.payments) {
               totalPayments = paymentsData.data.payments.reduce((sum, p) => sum + parseFloat(p.total || 0), 0);
           }
           
           tests.payments_summary = {
               success: true,
               total_payments: totalPayments,
               payments_breakdown: paymentsData.data?.payments,
               sequence_number: paymentsData.data?.register_closure_sequence_number,
               register_open_time: paymentsData.data?.register_open_time,
               full_response: paymentsData
           };
           console.log(`   ✅ Payments summary OK: $${totalPayments}, Secuencia: ${tests.payments_summary.sequence_number}`);
       } catch (error) {
           tests.payments_summary = { success: false, error: error.message };
           console.log(`   ❌ Error payments_summary: ${error.message}`);
       }
       
       // 3. Outlet info
       if (tests.basic_info?.success && tests.basic_info.data?.outlet_id) {
           try {
               console.log(`   🔍 Obteniendo info del outlet...`);
               const outletData = await callLightspeedAPI(`/outlets/${tests.basic_info.data.outlet_id}`);
               tests.outlet_info = {
                   success: true,
                   outlet_name: outletData.data?.name,
                   outlet_id: tests.basic_info.data.outlet_id
               };
               console.log(`   ✅ Outlet info OK: ${tests.outlet_info.outlet_name}`);
           } catch (error) {
               tests.outlet_info = { success: false, error: error.message };
               console.log(`   ❌ Error outlet info: ${error.message}`);
           }
       }
       
       // 4. Construir cierre completo si todo funciona
       if (tests.basic_info?.success && tests.payments_summary?.success) {
           tests.complete_closure = {
               id: registerNvoId,
               outlet: tests.outlet_info?.outlet_name || 'Unknown',
               register_name: tests.basic_info.data?.name,
               date: tests.basic_info.close_date,
               closed_at: tests.basic_info.data?.register_close_time,
               sales: tests.payments_summary.total_payments,
               payments: tests.payments_summary.total_payments,
               sequence_number: tests.payments_summary.sequence_number,
               url: `https://construmas.retail.lightspeed.app/register/closure/summary/${registerNvoId}`,
               payments_breakdown: tests.payments_summary.payments_breakdown
           };
           console.log(`   ✅ Cierre completo construido exitosamente`);
       }
       
       const isWorking = tests.basic_info?.success && tests.payments_summary?.success;
       
       res.json({
           success: true,
           register_tested: 'RegisterNVO',
           register_id: registerNvoId,
           tests: tests,
           working: isWorking,
           expected_date: tests.basic_info?.close_date,
           message: isWorking ? 
               `✅ RegisterNVO funciona correctamente. Fecha: ${tests.basic_info?.close_date}` : 
               '❌ Hay problemas con RegisterNVO',
           next_step: isWorking ? 
               `Usa la fecha ${tests.basic_info?.close_date} en tu búsqueda` :
               'Revisar permisos de API o configuración',
           timestamp: new Date().toISOString()
       });
       
   } catch (error) {
       console.error('❌ Error probando RegisterNVO:', error);
       res.status(500).json({
           success: false,
           error: error.message,
           timestamp: new Date().toISOString()
       });
   }
});

// Endpoint principal para obtener cierres - MEJORADO CON DEBUGGING
app.get('/api/closures', async (req, res) => {
   try {
       const { date } = req.query;
       
       if (!date) {
           return res.status(400).json({
               success: false,
               error: 'Parámetro date requerido (formato: YYYY-MM-DD)',
               suggestion: 'Usa /api/available-dates para ver fechas disponibles'
           });
       }

       console.log(`🔍 Buscando cierres X-Series para fecha: ${date}`);

       // Paso 1: Obtener todos los registros
       const registersResponse = await callLightspeedAPI('/registers');
       const registers = registersResponse.data;
       
       console.log(`📋 Encontrados ${registers.length} registros X-Series`);

       const closures = [];
       let processedCount = 0;
       let matchedCount = 0;
       let successfulCount = 0;
       
       for (const register of registers) {
           try {
               processedCount++;
               console.log(`🔍 [${processedCount}/${registers.length}] Registro X-Series: ${register.name}`);
               console.log(`   - ID: ${register.id}`);
               console.log(`   - Outlet ID: ${register.outlet_id}`);
               console.log(`   - Abierto: ${register.is_open ? 'SÍ' : 'NO'}`);
               console.log(`   - Fecha cierre: ${register.register_close_time}`);
               
               // Verificar si el registro tiene cierre y coincide con la fecha
               if (register.register_close_time) {
                   const closeDate = new Date(register.register_close_time).toISOString().split('T')[0];
                   console.log(`   - Fecha procesada: ${closeDate} (buscando: ${date})`);
                   
                   if (closeDate === date) {
                       matchedCount++;
                       console.log(`✅ MATCH [${matchedCount}]! Registro ${register.name} cerrado en ${date}`);
                       
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
                           
                           successfulCount++;
                           console.log(`✅ Cierre [${successfulCount}] X-Series agregado exitosamente`);
                           
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

       console.log(`📊 RESUMEN FINAL:`);
       console.log(`   - Registros procesados: ${processedCount}/${registers.length}`);
       console.log(`   - Registros con match de fecha: ${matchedCount}`);
       console.log(`   - Cierres exitosos: ${successfulCount}`);
       console.log(`   - Total cierres X-Series encontrados: ${closures.length}`);

       if (closures.length === 0) {
           // Mostrar fechas disponibles para debugging
           console.log(`🔍 FECHAS DE CIERRE DISPONIBLES EN X-SERIES:`);
           const availableDates = new Set();
           registers.forEach(register => {
               if (register.register_close_time) {
                   const closeDate = new Date(register.register_close_time).toISOString().split('T')[0];
                   availableDates.add(closeDate);
                   console.log(`   - ${register.name}: ${closeDate}`);
               }
           });
           
           return res.json({
               success: true,
               data: [],
               total: 0,
               date: date,
               message: `No se encontraron cierres X-Series para la fecha ${date}.`,
               api_version: 'X-Series v2.0',
               debug_info: {
                   total_registers: registers.length,
                   registers_with_close_time: registers.filter(r => r.register_close_time).length,
                   matched_registers: matchedCount,
                   successful_processing: successfulCount,
                   available_dates: Array.from(availableDates).sort().reverse()
               },
               suggestion: `Prueba con una de estas fechas: ${Array.from(availableDates).sort().reverse().slice(0, 3).join(', ')}`,
               debug_endpoints: [
                   `/api/debug-closures?date=${date}`,
                   '/api/test-registernvo',
                   '/api/available-dates'
               ]
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
           processing_summary: {
               total_registers: registers.length,
               matched_registers: matchedCount,
               successful_closures: successfulCount,
               processing_success_rate: `${Math.round((successfulCount/matchedCount)*100)}%`
           },
           timestamp: new Date().toISOString()
       });
       
   } catch (error) {
       console.error('❌ Error obteniendo cierres X-Series:', error);
       
       res.status(500).json({
           success: false,
           error: error.message,
           api_version: 'X-Series v2.0',
           suggestion: 'Verificar token y permisos para X-Series API',
           debug_endpoints: [
               '/api/debug-closures',
               '/api/test-registernvo'
           ],
           timestamp: new Date().toISOString()
       });
   }
});

// Probar conexión actualizado para X-Series
app.get('/api/test', async (req, res) => {
   try {
       if (!API_TOKEN || !API_URL) {
           throw new Error('Variables de entorno no configuradas para X-Series');
       }

       console.log(`🔍 Probando conexión X-Series: ${API_URL}`);

       // Probar endpoints específicos de X-Series
       const testEndpoints = ['/outlets', '/registers', '/payment_types'];
       const results = {};
       
       for (const endpoint of testEndpoints) {
           try {
               console.log(`   🔍 Probando ${endpoint}...`);
               const data = await callLightspeedAPI(endpoint);
               results[endpoint] = {
                   success: true,
                   count: data.data ? data.data.length : (Array.isArray(data) ? data.length : 'N/A'),
                   sample_keys: data.data && data.data.length > 0 ? Object.keys(data.data[0]).slice(0, 5) : []
               };
               console.log(`   ✅ ${endpoint}: ${results[endpoint].count} items`);
           } catch (error) {
               results[endpoint] = {
                   success: false,
                   error: error.message
               };
               console.log(`   ❌ ${endpoint}: ${error.message}`);
           }
       }
       
       const successfulTests = Object.values(results).filter(r => r.success).length;
       
       res.json({
           success: successfulTests > 0,
           message: successfulTests === testEndpoints.length ? 
               '✅ Conexión exitosa con Lightspeed X-Series API' :
               `⚠️ Conexión parcial: ${successfulTests}/${testEndpoints.length} endpoints funcionando`,
           api_version: 'X-Series v2.0',
           environment: 'Railway',
           api_url: API_URL,
           test_results: results,
           debug_endpoints: [
               '/api/debug-closures?date=YYYY-MM-DD',
               '/api/test-registernvo',
               '/api/available-dates'
           ],
           documentation: {
               main: 'https://x-series-api.lightspeedhq.com/',
               closing: 'https://x-series-api.lightspeedhq.com/docs/registers_closing',
               webhooks: 'https://x-series-api.lightspeedhq.com/docs/webhooks'
           },
           timestamp: new Date().toISOString()
       });
   } catch (error) {
       console.error('❌ Error en test de conexión:', error);
       res.status(500).json({
           success: false,
           message: '❌ Error conectando con Lightspeed X-Series API',
           error: error.message,
           api_url: API_URL,
           timestamp: new Date().toISOString()
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
       let totalWithClosures = 0;
       
       registers.forEach(register => {
           if (register.register_close_time) {
               totalWithClosures++;
               const closeDate = new Date(register.register_close_time).toISOString().split('T')[0];
               if (!availableDates[closeDate]) {
                   availableDates[closeDate] = [];
               }
               availableDates[closeDate].push({
                   register_name: register.name,
                   register_id: register.id,
                   close_time: register.register_close_time,
                   is_open: register.is_open
               });
               console.log(`📅 ${register.name}: ${closeDate}`);
           }
       });
       
       const datesList = Object.keys(availableDates).sort().reverse();
       console.log(`📊 Total fechas con cierres: ${datesList.length}`);
       
       res.json({
           success: true,
           api_version: 'X-Series v2.0',
           total_registers: registers.length,
           registers_with_closures: totalWithClosures,
           available_dates: availableDates,
           dates_list: datesList,
           most_recent_dates: datesList.slice(0, 5),
           message: datesList.length > 0 ? 
               `Se encontraron cierres en ${datesList.length} fechas diferentes` :
               'No se encontraron cierres en el sistema',
           suggestion: datesList.length > 0 ? 
               `Prueba con una de estas fechas: ${datesList.slice(0, 3).join(', ')}` :
               'Verifica que los registros se hayan cerrado correctamente',
           timestamp: new Date().toISOString()
       });
       
   } catch (error) {
       console.error('❌ Error obteniendo fechas disponibles:', error);
       res.status(500).json({
           success: false,
           error: error.message,
           timestamp: new Date().toISOString()
       });
   }
});

// Ruta principal
app.get('/', (req, res) => {
   res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
   console.log(`🚀 Servidor X-Series con DEBUG corriendo en puerto ${PORT}`);
   console.log(`📱 Usando Lightspeed X-Series API: ${API_URL}`);
   console.log(`🔑 Token configurado: ${API_TOKEN ? 'Sí' : 'No'}`);
   console.log(`📚 Documentación: https://x-series-api.lightspeedhq.com/`);
   console.log(`🎯 Endpoint clave: /registers/:id/payments_summary`);
   console.log(`🔍 DEBUG Endpoints:`);
   console.log(`   - /api/debug-closures?date=YYYY-MM-DD`);
   console.log(`   - /api/test-registernvo`);
   console.log(`   - /api/available-dates`);
   console.log(`🔔 Webhook disponible: register_closure.create`);
});

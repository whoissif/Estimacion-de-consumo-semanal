// Variables globales
let consumptionData = [];
let weatherForecast = [];
let weeklyChart = null;
let consumptionChart = null;
let currentTab = 'data';

// Ubicación por defecto
const DEFAULT_LOCATION = "San Martín de Valdeiglesias, Madrid";

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    // Configurar eventos de las pestañas
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
    
    // Configurar eventos de carga de archivos
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const selectButton = document.getElementById('select-button');
    const resetLocationBtn = document.getElementById('reset-location');
    
    // Eventos de drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropArea.style.borderColor = '#3498db';
        dropArea.style.backgroundColor = 'rgba(52, 152, 219, 0.1)';
    }
    
    function unhighlight() {
        dropArea.style.borderColor = '#ddd';
        dropArea.style.backgroundColor = '';
    }
    
    // Evento drop
    dropArea.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length) {
            fileInput.files = files;
            handleFiles(files);
        }
    }
    
    // Evento click para seleccionar archivo
    selectButton.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
    
    // Botón para restablecer ubicación por defecto
    resetLocationBtn.addEventListener('click', function() {
        document.getElementById('location').value = DEFAULT_LOCATION;
    });
    
    // Botón para generar pronóstico meteorológico
    document.getElementById('generate-forecast').addEventListener('click', generateWeatherForecast);
    
    // Botón para calcular costes
    document.getElementById('calculate-cost').addEventListener('click', calculateWeeklyCost);
    
    // Evento para cambiar tipo de tarifa
    document.getElementById('tariff-type').addEventListener('change', function() {
        document.getElementById('pvpc-prices').style.display = 
            this.value === 'pvpc' ? 'block' : 'none';
    });
    
    // Inicializar gráficos (vacíos al principio)
    initCharts();
});

function switchTab(tabId) {
    // Verificar si ya estamos en esta pestaña
    if (currentTab === tabId) return;
    
    // Actualizar pestañas activas
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    
    // Actualizar contenido de pestañas
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabId}-tab`).classList.add('active');
    
    currentTab = tabId;
    
    // Acciones específicas por pestaña
    if (tabId === 'results' && consumptionData.length > 0 && weatherForecast.length > 0) {
        // Si hay datos y pronóstico, calcular los resultados automáticamente
        setTimeout(calculateWeeklyEstimation, 300);
    } else if (tabId === 'results' && consumptionData.length > 0) {
        // Si hay datos pero no hay pronóstico, generar una notificación
        showNotification('ℹ️ Para ver resultados completos, genera primero el pronóstico meteorológico', 'warning');
    }
}

function handleFiles(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    const fileInfo = document.getElementById('file-info');
    fileInfo.innerHTML = `
        <p><strong>Archivo seleccionado:</strong> ${file.name}</p>
        <p><strong>Tamaño:</strong> ${(file.size / 1024).toFixed(2)} KB</p>
        <p><strong>Última modificación:</strong> ${new Date(file.lastModified).toLocaleString()}</p>
    `;
    
    // Leer el archivo Excel
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            processData(workbook, file.name);
        } catch (error) {
            console.error('Error al procesar el archivo:', error);
            showNotification('❌ Error al procesar el archivo. Asegúrate de que sea un archivo Excel válido.', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function processData(workbook, fileName) {
    // Buscar la hoja correcta (la primera hoja)
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertir a JSON con formato crudo
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
    
    // Procesar los datos
    consumptionData = parseConsumptionData(jsonData);
    
    if (consumptionData.length === 0) {
        showNotification('❌ No se encontraron datos de consumo válidos en el archivo. Formato no compatible.', 'error');
        return;
    }
    
    // Mostrar datos en la tabla
    displayDataPreview();
    
    // Actualizar gráfico de consumo
    updateConsumptionChart();
    
    // Mostrar mensaje de éxito
    const totalHours = (consumptionData[consumptionData.length - 1].timestamp - consumptionData[0].timestamp) / (1000 * 60 * 60);
    showNotification(`✅ Datos cargados correctamente. ${consumptionData.length} registros de ${totalHours.toFixed(1)} horas de consumo.`, 'success');
}

function parseConsumptionData(jsonData) {
    const parsedData = [];
    let inDataSection = false;
    let dateColumn = 0;
    let powerColumn = 1;
    
    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // Continuar solo si la fila es un array y tiene al menos una columna
        if (!Array.isArray(row) || row.length === 0) continue;
        
        const firstCell = String(row[0]).trim();
        
        // Detectar el inicio de los datos (después de "VALORES CONTINUOS")
        if (firstCell.includes('VALORES CONTINUOS')) {
            inDataSection = true;
            continue;
        }
        
        // Procesar datos solo si estamos en una sección de datos
        if (inDataSection && row.length > 1) {
            const dateStr = String(row[dateColumn]).trim();
            const powerStr = String(row[powerColumn]).trim();
            
            // Validar que la fila contiene datos válidos
            if (dateStr && powerStr && !dateStr.includes('Fecha') && !dateStr.includes('Potencia') && 
                !dateStr.includes('Dirección') && !dateStr.includes('C/ CUBA') && !firstCell.includes('VALORES CONTINUOS')) {
                
                // Verificar si es una fecha en formato dd/mm/yyyy hh:mm:ss o dd/mm/yyyy hh:mm
                if (dateStr.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}(:\d{2})?/)) {
                    try {
                        // Separar la fecha y la hora
                        const [datePart, timePart] = dateStr.split(' ');
                        const dateParts = datePart.split('/');
                        
                        // Procesar hora
                        let hour = 0, min = 0, sec = 0;
                        if (timePart) {
                            const timeParts = timePart.split(':');
                            hour = parseInt(timeParts[0]) || 0;
                            min = parseInt(timeParts[1]) || 0;
                            sec = timeParts.length > 2 ? parseInt(timeParts[2]) || 0 : 0;
                        }
                        
                        // Crear fecha (asumimos formato dd/mm/yyyy)
                        const date = new Date(
                            parseInt(dateParts[2]), // año
                            parseInt(dateParts[1]) - 1, // mes (0-indexado)
                            parseInt(dateParts[0]), // día
                            hour,
                            min,
                            sec
                        );
                        
                        if (isNaN(date.getTime())) continue;
                        
                        // Parsear potencia
                        let power = parseFloat(powerStr.replace('W', '').replace(',', '.').trim());
                        if (isNaN(power)) continue;
                        
                        parsedData.push({
                            date: date,
                            power: power,
                            timestamp: date.getTime()
                        });
                    } catch (e) {
                        continue;
                    }
                }
            }
        }
    }
    
    // Ordenar por fecha
    parsedData.sort((a, b) => a.timestamp - b.timestamp);
    
    return parsedData;
}

function displayDataPreview() {
    const tableContainer = document.getElementById('data-table');
    
    if (consumptionData.length === 0) {
        tableContainer.innerHTML = '<p>No hay datos para mostrar. Por favor, carga un archivo primero.</p>';
        return;
    }
    
    // Mostrar solo los primeros 10 registros para la vista previa
    const previewData = consumptionData.slice(0, Math.min(10, consumptionData.length));
    
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Potencia (W)</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    previewData.forEach(item => {
        tableHTML += `
            <tr>
                <td>${item.date.toLocaleString('es-ES')}</td>
                <td>${Math.round(item.power)} W</td>
            </tr>
        `;
    });
    
    tableHTML += `
            </tbody>
        </table>
    `;
    
    if (consumptionData.length > 10) {
        tableHTML += `<p style="margin-top: 10px; font-style: italic;">Mostrando ${previewData.length} de ${consumptionData.length} registros</p>`;
    }
    
    tableContainer.innerHTML = tableHTML;
}

function initCharts() {
    // Inicializar gráfico de consumo
    const ctx1 = document.getElementById('consumption-chart').getContext('2d');
    consumptionChart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Potencia (W)',
                data: [],
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                borderWidth: 2,
                pointRadius: 3,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Potencia (W)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Hora'
                    }
                }
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false
                },
                legend: {
                    position: 'top',
                }
            }
        }
    });
    
    // Inicializar gráfico semanal
    const ctx2 = document.getElementById('weekly-chart').getContext('2d');
    weeklyChart = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
            datasets: [{
                label: 'Consumo Diario (kWh)',
                data: [0, 0, 0, 0, 0, 0, 0],
                backgroundColor: [
                    'rgba(52, 152, 219, 0.7)',
                    'rgba(52, 152, 219, 0.7)',
                    'rgba(52, 152, 219, 0.7)',
                    'rgba(52, 152, 219, 0.7)',
                    'rgba(52, 152, 219, 0.7)',
                    'rgba(46, 204, 113, 0.7)',
                    'rgba(46, 204, 113, 0.7)'
                ],
                borderColor: [
                    'rgba(52, 152, 219, 1)',
                    'rgba(52, 152, 219, 1)',
                    'rgba(52, 152, 219, 1)',
                    'rgba(52, 152, 219, 1)',
                    'rgba(52, 152, 219, 1)',
                    'rgba(46, 204, 113, 1)',
                    'rgba(46, 204, 113, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Consumo (kWh)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function updateConsumptionChart() {
    if (!consumptionChart || consumptionData.length === 0) return;
    
    // Preparar datos para el gráfico
    const labels = consumptionData.map(item => {
        return item.date.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'});
    });
    
    const values = consumptionData.map(item => Math.round(item.power));
    
    // Actualizar el gráfico
    consumptionChart.data.labels = labels;
    consumptionChart.data.datasets[0].data = values;
    consumptionChart.update();
}

function generateWeatherForecast() {
    const weatherLoading = document.getElementById('weather-loading');
    const weatherContainer = document.getElementById('weather-forecast');
    const locationInput = document.getElementById('location');
    const location = locationInput.value.trim();
    
    if (!location) {
        locationInput.value = DEFAULT_LOCATION;
        showNotification('⚠️ Debes especificar una ubicación para el pronóstico', 'warning');
        return;
    }
    
    weatherLoading.style.display = 'block';
    weatherContainer.innerHTML = '';
    
    // Simular carga de datos meteorológicos
    setTimeout(() => {
        // Generar pronóstico meteorológico simulado
        weatherForecast = generateSimulatedForecast(location);
        
        // Mostrar el pronóstico
        displayWeatherForecast();
        
        weatherLoading.style.display = 'none';
        showNotification(`✅ Pronóstico meteorológico generado para ${location}`, 'success');
    }, 1500);
}

function generateSimulatedForecast(location) {
    // Obtener la fecha actual del último dato o usar hoy
    let baseDate = new Date();
    if (consumptionData.length > 0) {
        baseDate = new Date(consumptionData[consumptionData.length - 1].date);
    }
    
    // Asegurarse de que sea el lunes de la semana actual
    const day = baseDate.getDay(); // 0=domingo, 1=lunes, etc.
    const diff = (day === 1) ? 0 : (8 - day) % 7;
    baseDate.setDate(baseDate.getDate() + diff);
    
    // Generar pronóstico para los próximos 7 días
    const forecast = [];
    
    // Determinar si la ubicación es San Martín de Valdeiglesias o similar
    const isDefaultLocation = location.toLowerCase().includes('san martin') || 
                              location.toLowerCase().includes('valdeiglesias') ||
                              location.toLowerCase().includes('madrid') ||
                              location.toLowerCase().includes('españa') ||
                              location.toLowerCase().includes('spain');
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() + i);
        
        // Generar temperaturas según la ubicación
        let minTemp, maxTemp;
        
        if (isDefaultLocation) {
            // Patrón para San Martín de Valdeiglesias en noviembre
            if (i < 5) { // Días laborables
                minTemp = -1 + Math.floor(Math.random() * 3); // De -1 a 1°C
                maxTemp = 7 + Math.floor(Math.random() * 4); // De 7 a 10°C
            } else { // Fin de semana
                minTemp = 3 + Math.floor(Math.random() * 3); // De 3 a 5°C
                maxTemp = 12 + Math.floor(Math.random() * 3); // De 12 a 14°C
            }
            
            // Ajustar según el día específico
            switch(i) {
                case 0: // Lunes
                    minTemp = 0;
                    maxTemp = 8;
                    break;
                case 1: // Martes
                    minTemp = -1;
                    maxTemp = 7;
                    break;
                case 2: // Miércoles
                    minTemp = 1;
                    maxTemp = 9;
                    break;
                case 3: // Jueves
                    minTemp = 2;
                    maxTemp = 10;
                    break;
                case 4: // Viernes
                    minTemp = 1;
                    maxTemp = 11;
                    break;
                case 5: // Sábado
                    minTemp = 4;
                    maxTemp = 13;
                    break;
                case 6: // Domingo
                    minTemp = 5;
                    maxTemp = 14;
                    break;
            }
        } else {
            // Patrón para otras ubicaciones (más suave, basado en clima mediterráneo)
            const baseMin = 8;
            const baseMax = 18;
            
            // Añadir variabilidad según el día
            minTemp = baseMin + Math.floor(Math.random() * 3) - 1;
            maxTemp = baseMax + Math.floor(Math.random() * 4) - 2;
            
            // Ajustar para fin de semana (un poco más cálido)
            if (i >= 5) {
                minTemp += 2;
                maxTemp += 2;
            }
            
            // Ajustar según día específico para mayor realismo
            switch(i) {
                case 0: // Lunes
                    minTemp = 8;
                    maxTemp = 16;
                    break;
                case 1: // Martes
                    minTemp = 7;
                    maxTemp = 15;
                    break;
                case 2: // Miércoles
                    minTemp = 9;
                    maxTemp = 17;
                    break;
                case 3: // Jueves
                    minTemp = 10;
                    maxTemp = 18;
                    break;
                case 4: // Viernes
                    minTemp = 9;
                    maxTemp = 18;
                    break;
                case 5: // Sábado
                    minTemp = 12;
                    maxTemp = 20;
                    break;
                case 6: // Domingo
                    minTemp = 13;
                    maxTemp = 21;
                    break;
            }
        }
        
        forecast.push({
            date: date,
            day: date.toLocaleDateString('es-ES', {weekday: 'long'}),
            minTemp: minTemp,
            maxTemp: maxTemp,
            avgTemp: (minTemp + maxTemp) / 2,
            location: location
        });
    }
    
    return forecast;
}

function displayWeatherForecast() {
    const container = document.getElementById('weather-forecast');
    const location = document.getElementById('location').value;
    
    container.innerHTML = '';
    
    if (weatherForecast.length === 0) {
        container.innerHTML = '<p>No hay datos de pronóstico disponibles. Por favor, genera el pronóstico primero.</p>';
        return;
    }
    
    // Añadir título con la ubicación
    container.innerHTML = `
        <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
            <h3 style="margin: 0 0 5px 0; color: var(--primary-color);">Pronóstico para ${location}</h3>
            <small style="color: #7f8c8d;">Estimación basada en datos históricos de la zona</small>
        </div>
    `;
    
    weatherForecast.forEach(day => {
        const dayElement = document.createElement('div');
        dayElement.className = 'weather-day';
        
        const dayName = day.date.toLocaleDateString('es-ES', {weekday: 'short', day: 'numeric'});
        
        dayElement.innerHTML = `
            <div class="weather-date">${dayName}</div>
            <div class="weather-temp">↑ ${day.maxTemp}°C / ↓ ${day.minTemp}°C</div>
            <div style="margin-top: 10px;">
                <span style="background: ${getTempColor(day.avgTemp)}; 
                      color: white; padding: 3px 8px; border-radius: 12px; font-size: 0.9rem;">
                      ${day.avgTemp.toFixed(1)}°C prom.
                </span>
            </div>
        `;
        
        container.appendChild(dayElement);
    });
}

function getTempColor(temp) {
    // Devolver un color según la temperatura
    if (temp < 0) return '#2c3e50'; // Azul oscuro para temperaturas bajo cero
    if (temp < 5) return '#3498db'; // Azul para frío
    if (temp < 10) return '#2ecc71'; // Verde para fresco/templado
    if (temp < 15) return '#f1c40f'; // Amarillo/naranja para templado
    if (temp < 20) return '#e67e22'; // Naranja para cálido
    return '#e74c3c'; // Rojo para muy cálido
}

function calculateWeeklyEstimation() {
    if (consumptionData.length === 0) {
        showNotification('⚠️ Por favor, carga primero los datos de consumo', 'warning');
        switchTab('data');
        return;
    }
    
    if (weatherForecast.length === 0) {
        showNotification('⚠️ Por favor, genera primero el pronóstico meteorológico', 'warning');
        switchTab('analysis');
        return;
    }
    
    const resultsLoading = document.getElementById('results-loading');
    resultsLoading.style.display = 'block';
    
    // Simular cálculo complejo
    setTimeout(() => {
        // 1. Analizar el patrón de consumo de los datos cargados
        const consumptionPattern = analyzeConsumptionPattern();
        
        // 2. Calcular el consumo diario estimado con ajustes por temperatura
        const dailyEstimates = calculateDailyConsumption(consumptionPattern);
        
        // 3. Calcular el consumo semanal total
        const weeklyConsumption = dailyEstimates.reduce((sum, day) => sum + day.consumption, 0);
        
        // 4. Actualizar el gráfico semanal
        updateWeeklyChart(dailyEstimates);
        
        // 5. Mostrar resultados preliminares
        document.getElementById('weekly-consumption').textContent = `${weeklyConsumption.toFixed(1)} kWh`;
        
        resultsLoading.style.display = 'none';
        
        // Mostrar notificación
        showNotification(`✅ Estimación calculada: ${weeklyConsumption.toFixed(1)} kWh para la semana`, 'success');
        
        // Cambiar automáticamente a la pestaña de resultados si no estamos allí
        if (currentTab !== 'results') {
            setTimeout(() => {
                switchTab('results');
            }, 1000);
        }
    }, 1000);
}

function analyzeConsumptionPattern() {
    // Analizar los datos de consumo para identificar patrones
    if (consumptionData.length < 10) {
        // Si hay pocos datos, usar valores predeterminados pero con flexibilidad para parámetros
        return {
            initialPhasePower: 950,
            maintenancePower: parseFloat(document.getElementById('maintenance-power').value) || 610,
            stabilizationHours: 14,
            hourlyPattern: generateDefaultHourlyPattern()
        };
    }
    
    // Calcular estadísticas básicas
    const totalHours = (consumptionData[consumptionData.length - 1].timestamp - consumptionData[0].timestamp) / (1000 * 60 * 60);
    const avgPower = consumptionData.reduce((sum, item) => sum + item.power, 0) / consumptionData.length;
    
    // Identificar la fase de estabilización (cuando la potencia baja y se estabiliza)
    let stabilizationIndex = Math.min(Math.floor(consumptionData.length * 0.5), consumptionData.length - 10);
    
    // Buscar cuando la potencia se estabiliza por debajo de 700W
    for (let i = 10; i < consumptionData.length - 5; i++) {
        const windowAvg = consumptionData.slice(i, i + 5).reduce((sum, item) => sum + item.power, 0) / 5;
        if (windowAvg < 700 && consumptionData[i].power < 700) {
            stabilizationIndex = i;
            break;
        }
    }
    
    // Calcular potencia inicial y de mantenimiento
    const initialPhase = consumptionData.slice(0, Math.max(10, stabilizationIndex));
    const maintenancePhase = consumptionData.slice(stabilizationIndex);
    
    const initialPower = initialPhase.reduce((sum, item) => sum + item.power, 0) / initialPhase.length;
    const maintenancePower = maintenancePhase.length > 0 ? 
        maintenancePhase.reduce((sum, item) => sum + item.power, 0) / maintenancePhase.length : 600;
    
    // Crear patrón horario basado en los datos
    const hourlyPattern = Array.from({length: 24}, (_, hour) => {
        // Calcular potencia media para cada hora del día
        const hourData = consumptionData.filter(item => {
            return item.date.getHours() === hour;
        });
        
        let power;
        if (hourData.length > 0) {
            power = hourData.reduce((sum, item) => sum + item.power, 0) / hourData.length;
        } else {
            // Si no hay datos para esta hora, interpolar basado en la fase
            if (hour < 6 || hour >= 22) {
                power = initialPower * 0.9; // Madrugada
            } else if (hour < 10) {
                power = initialPower * 0.8; // Mañana temprano
            } else if (hour < 18) {
                power = maintenancePower * 1.1; // Día
            } else {
                power = initialPower * 0.85; // Tarde-noche
            }
        }
        
        return {
            hour: hour,
            power: Math.round(power)
        };
    });
    
    return {
        initialPhasePower: Math.round(initialPower),
        maintenancePower: Math.round(maintenancePower),
        stabilizationHours: Math.round((consumptionData[stabilizationIndex].timestamp - consumptionData[0].timestamp) / (1000 * 60 * 60)),
        hourlyPattern: hourlyPattern
    };
}

function calculateDailyConsumption(consumptionPattern) {
    // Obtener parámetros de configuración
    const targetTemp = parseFloat(document.getElementById('target-temp').value);
    const consumptionFactor = parseFloat(document.getElementById('consumption-factor').value);
    const maintenancePower = parseFloat(document.getElementById('maintenance-power').value);
    
    // Calcular consumo para cada día de la semana
    return weatherForecast.map((day, index) => {
        // Calcular diferencia de temperatura
        const tempDiff = targetTemp - day.avgTemp;
        
        // Factor de ajuste por temperatura (más diferencia = más consumo)
        const tempFactor = 1 + (Math.max(0, tempDiff) * consumptionFactor);
        
        // Ajuste por día de la semana (laborables vs fin de semana)
        const isWeekend = index >= 5;
        const dayFactor = isWeekend ? 0.85 : 1.0; // Menos consumo en fin de semana
        
        // Calcular consumo diario en kWh usando el patrón horario ajustado
        let dailyConsumption = 0;
        
        consumptionPattern.hourlyPattern.forEach(hourData => {
            // Determinar si esta hora está en modo mantenimiento o no
            const isMaintenanceHour = hourData.power <= consumptionPattern.maintenancePower * 1.2;
            
            let adjustedPower;
            if (isMaintenanceHour) {
                // Usar la potencia de mantenimiento configurada
                adjustedPower = maintenancePower * tempFactor * dayFactor;
            } else {
                // Usar la potencia del patrón ajustada
                adjustedPower = hourData.power * tempFactor * dayFactor;
            }
            
            // Convertir a kWh para esta hora
            dailyConsumption += adjustedPower / 1000;
        });
        
        return {
            day: day.day,
            date: day.date,
            consumption: parseFloat(dailyConsumption.toFixed(1)),
            tempDiff: tempDiff,
            tempFactor: tempFactor,
            dayFactor: dayFactor
        };
    });
}

function updateWeeklyChart(dailyEstimates) {
    if (!weeklyChart) return;
    
    // Extraer los datos de consumo para cada día
    const consumptionValues = dailyEstimates.map(day => day.consumption);
    
    // Actualizar el gráfico
    weeklyChart.data.datasets[0].data = consumptionValues;
    weeklyChart.update();
}

function calculateWeeklyCost() {
    const resultsLoading = document.getElementById('results-loading');
    resultsLoading.style.display = 'block';
    
    // Simular cálculo
    setTimeout(() => {
        if (weatherForecast.length === 0 || consumptionData.length === 0) {
            // Calcular una estimación básica basada en los datos iniciales
            calculateBasicEstimation();
        } else {
            // Usar los datos completos para un cálculo más preciso
            calculateAdvancedEstimation();
        }
        
        resultsLoading.style.display = 'none';
    }, 800);
}

function calculateBasicEstimation() {
    if (consumptionData.length === 0) {
        showNotification('⚠️ No hay datos de consumo para calcular una estimación básica', 'warning');
        return;
    }
    
    // Calcular consumo semanal basado en el promedio por hora de los datos cargados
    const hoursMeasured = (consumptionData[consumptionData.length - 1].timestamp - consumptionData[0].timestamp) / (1000 * 60 * 60);
    const totalConsumption = consumptionData.reduce((sum, item) => sum + (item.power * 0.001), 0); // Convertir W a kW
    
    // Calcular consumo promedio por hora
    const avgHourlyConsumption = totalConsumption / hoursMeasured || 0.6; // Valor por defecto
    
    // Estimar consumo semanal (168 horas)
    const weeklyConsumption = avgHourlyConsumption * 168 * 0.8; // Ajuste del 20% para considerar modo mantenimiento
    
    // Calcular costes con tarifa PVPC
    const vallePrice = parseFloat(document.getElementById('valle-price').value);
    const llanoPrice = parseFloat(document.getElementById('llano-price').value);
    const puntaPrice = parseFloat(document.getElementById('punta-price').value);
    
    // Distribución típica de consumo en horas:
    // Valle (22:00-8:00): 37%
    // Llano (8:00-10:00, 14:00-18:00): 31% 
    // Punta (10:00-14:00, 18:00-22:00): 32%
    
    const valleConsumption = weeklyConsumption * 0.37;
    const llanoConsumption = weeklyConsumption * 0.31;
    const puntaConsumption = weeklyConsumption * 0.32;
    
    const energyCost = 
        (valleConsumption * vallePrice) + 
        (llanoConsumption * llanoPrice) + 
        (puntaConsumption * puntaPrice);
    
    const electricTax = energyCost * 0.051127;
    const subtotal = energyCost + electricTax;
    const iva = subtotal * 0.21;
    const totalCost = subtotal + iva;
    
    // Mostrar resultados
    document.getElementById('weekly-consumption').textContent = `${weeklyConsumption.toFixed(1)} kWh`;
    document.getElementById('energy-cost').textContent = `${energyCost.toFixed(2)} €`;
    document.getElementById('electric-tax').textContent = `${electricTax.toFixed(2)} €`;
    document.getElementById('iva-cost').textContent = `${iva.toFixed(2)} €`;
    document.getElementById('total-cost').textContent = `${totalCost.toFixed(2)} €`;
    
    // Actualizar el gráfico semanal con valores de ejemplo
    if (weeklyChart) {
        const avgDaily = weeklyConsumption / 7;
        weeklyChart.data.datasets[0].data = [
            avgDaily * 1.1, // Lunes
            avgDaily * 1.15, // Martes
            avgDaily * 1.05, // Miércoles
            avgDaily * 0.95, // Jueves
            avgDaily * 0.9,  // Viernes
            avgDaily * 0.85, // Sábado
            avgDaily * 0.8   // Domingo
        ];
        weeklyChart.update();
    }
    
    showNotification('✅ Estimación básica calculada basada en los datos cargados', 'success');
}

function calculateAdvancedEstimation() {
    // 1. Obtener el patrón de consumo
    const consumptionPattern = analyzeConsumptionPattern();
    
    // 2. Calcular consumo diario
    const dailyEstimates = calculateDailyConsumption(consumptionPattern);
    
    // 3. Calcular consumo semanal total
    const weeklyConsumption = dailyEstimates.reduce((sum, day) => sum + day.consumption, 0);
    
    // 4. Calcular distribución por franjas horarias PVPC
    const vallePrice = parseFloat(document.getElementById('valle-price').value);
    const llanoPrice = parseFloat(document.getElementById('llano-price').value);
    const puntaPrice = parseFloat(document.getElementById('punta-price').value);
    
    // Calcular consumo por franjas usando los datos diarios reales
    let valleConsumption = 0;
    let llanoConsumption = 0;
    let puntaConsumption = 0;
    
    // Recalcular el patrón horario con los parámetros actualizados
    const hourlyPattern = recalculateHourlyPattern(consumptionPattern);
    
    // Distribuir el consumo semanal por franjas horarias basado en el patrón horario
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const isWeekend = dayIndex >= 5;
        const dayFactor = isWeekend ? 0.85 : 1.0;
        
        hourlyPattern.forEach(hourData => {
            const hour = hourData.hour;
            const hourlyPower = hourData.power;
            const hourlyConsumption = hourlyPower / 1000; // kWh por hora
            
            if (hour >= 22 || hour < 8) { // Valle: 22:00-8:00
                valleConsumption += hourlyConsumption * dayFactor;
            } else if ((hour >= 8 && hour < 10) || (hour >= 14 && hour < 18)) { // Llano
                llanoConsumption += hourlyConsumption * dayFactor;
            } else { // Punta
                puntaConsumption += hourlyConsumption * dayFactor;
            }
        });
    }
    
    // 5. Calcular costes con tarifa PVPC
    const energyCost = 
        (valleConsumption * vallePrice) + 
        (llanoConsumption * llanoPrice) + 
        (puntaConsumption * puntaPrice);
    
    const electricTax = energyCost * 0.051127;
    const subtotal = energyCost + electricTax;
    const iva = subtotal * 0.21;
    const totalCost = subtotal + iva;
    
    // 6. Mostrar resultados
    document.getElementById('weekly-consumption').textContent = `${weeklyConsumption.toFixed(1)} kWh`;
    document.getElementById('energy-cost').textContent = `${energyCost.toFixed(2)} €`;
    document.getElementById('electric-tax').textContent = `${electricTax.toFixed(2)} €`;
    document.getElementById('iva-cost').textContent = `${iva.toFixed(2)} €`;
    document.getElementById('total-cost').textContent = `${totalCost.toFixed(2)} €`;
    
    // 7. Actualizar gráfico semanal
    const dailyConsumptionValues = dailyEstimates.map(day => day.consumption);
    if (weeklyChart) {
        weeklyChart.data.datasets[0].data = dailyConsumptionValues;
        weeklyChart.update();
    }
    
    // 8. Generar recomendaciones personalizadas
    generateOptimizationTips(weeklyConsumption, totalCost);
    
    showNotification(`✅ Cálculo avanzado completado. Coste semanal estimado: ${totalCost.toFixed(2)} €`, 'success');
}

// NUEVA FUNCIÓN: Recalcular el patrón horario con los parámetros actualizados
function recalculateHourlyPattern(basePattern) {
    const targetTemp = parseFloat(document.getElementById('target-temp').value);
    const consumptionFactor = parseFloat(document.getElementById('consumption-factor').value);
    const maintenancePower = parseFloat(document.getElementById('maintenance-power').value);
    
    // Obtener temperatura promedio de la semana
    const avgTemp = weatherForecast.reduce((sum, day) => sum + day.avgTemp, 0) / weatherForecast.length;
    const tempDiff = targetTemp - avgTemp;
    
    // Factor de ajuste por temperatura
    const tempFactor = 1 + (Math.max(0, tempDiff) * consumptionFactor);
    
    // Crear nuevo patrón horario ajustado
    return basePattern.hourlyPattern.map(hourData => {
        let adjustedPower = hourData.power;
        
        // Ajustar potencia según si está en fase de mantenimiento o no
        if (hourData.power <= basePattern.maintenancePower * 1.2) {
            // Horas de mantenimiento - usar potencia de mantenimiento ajustada
            adjustedPower = maintenancePower * tempFactor;
        } else {
            // Horas de alto consumo - aplicar factor de temperatura
            adjustedPower = hourData.power * tempFactor;
        }
        
        // Limitar valores razonables
        adjustedPower = Math.max(300, Math.min(1800, adjustedPower));
        
        return {
            hour: hourData.hour,
            power: adjustedPower
        };
    });
}

// NUEVA FUNCIÓN: Generar patrón horario predeterminado
function generateDefaultHourlyPattern() {
    const maintenancePower = parseFloat(document.getElementById('maintenance-power').value) || 610;
    
    // Patrón horario base para calefacción en noviembre
    return [
        { hour: 0, power: 950 },   // 00:00-01:00
        { hour: 1, power: 950 },   // 01:00-02:00
        { hour: 2, power: 900 },   // 02:00-03:00
        { hour: 3, power: 850 },   // 03:00-04:00
        { hour: 4, power: 900 },   // 04:00-05:00
        { hour: 5, power: 950 },   // 05:00-06:00
        { hour: 6, power: 850 },   // 06:00-07:00
        { hour: 7, power: 800 },   // 07:00-08:00
        { hour: 8, power: 750 },   // 08:00-09:00
        { hour: 9, power: 700 },   // 09:00-10:00
        { hour: 10, power: 650 },  // 10:00-11:00
        { hour: 11, power: 600 },  // 11:00-12:00
        { hour: 12, power: 550 },  // 12:00-13:00
        { hour: 13, power: 550 },  // 13:00-14:00
        { hour: 14, power: 580 },  // 14:00-15:00
        { hour: 15, power: 600 },  // 15:00-16:00
        { hour: 16, power: 620 },  // 16:00-17:00
        { hour: 17, power: 650 },  // 17:00-18:00
        { hour: 18, power: 680 },  // 18:00-19:00
        { hour: 19, power: 700 },  // 19:00-20:00
        { hour: 20, power: 680 },  // 20:00-21:00
        { hour: 21, power: 650 },  // 21:00-22:00
        { hour: 22, power: 600 },  // 22:00-23:00
        { hour: 23, power: 550 }   // 23:00-00:00
    ].map(item => {
        // Ajustar el patrón según la potencia de mantenimiento configurada
        if (item.power <= 650) {
            return {
                hour: item.hour,
                power: maintenancePower
            };
        }
        return item;
    });
}

function generateOptimizationTips(weeklyConsumption, totalCost) {
    const tipsContainer = document.getElementById('optimization-tips');
    
    // Calcular potenciales ahorros basados en el consumo real
    const tempReductionSaving = weeklyConsumption * 0.08; // 8% por subir 1°C
    const tempReductionCostSaving = totalCost * 0.08;
    
    const scheduleOptimizationSaving = weeklyConsumption * 0.12; // 12% por optimizar horarios
    const scheduleOptimizationCostSaving = totalCost * 0.12;
    
    const weekendOptimizationSaving = weeklyConsumption * 0.07; // 7% por optimizar fin de semana
    const weekendOptimizationCostSaving = totalCost * 0.07;
    
    tipsContainer.innerHTML = `
        <ul style="line-height: 1.8;">
            <li><strong>🌡️ Ajuste de temperatura:</strong> Subir la temperatura 1°C (de 18°C a 19°C) podría ahorrar 
                <span style="color: var(--success-color); font-weight: bold;">${tempReductionSaving.toFixed(1)} kWh</span> 
                y <span style="color: var(--success-color); font-weight: bold;">${tempReductionCostSaving.toFixed(2)} €</span> semanales.</li>
            
            <li><strong>⏰ Optimización horaria:</strong> Programar temperaturas más bajas en horas valle (22:00-8:00) 
                podría ahorrar <span style="color: var(--success-color); font-weight: bold;">${scheduleOptimizationSaving.toFixed(1)} kWh</span> 
                y <span style="color: var(--success-color); font-weight: bold;">${scheduleOptimizationCostSaving.toFixed(2)} €</span> semanales.</li>
            
            <li><strong>🏠 Fin de semana:</strong> Reducir la temperatura en 2°C durante horas sin ocupación los fines de semana 
                podría ahorrar <span style="color: var(--success-color); font-weight: bold;">${weekendOptimizationSaving.toFixed(1)} kWh</span> 
                y <span style="color: var(--success-color); font-weight: bold;">${weekendOptimizationCostSaving.toFixed(2)} €</span>.</li>
            
            <li><strong>🧼 Mantenimiento:</strong> Limpiar los filtros y revisar el sistema podría mejorar la eficiencia 
                en un 10-15%, ahorrando aproximadamente <span style="color: var(--success-color); font-weight: bold;">${(weeklyConsumption * 0.12).toFixed(1)} kWh</span> semanales.</li>
        </ul>
        <div style="margin-top: 15px; padding: 12px; background: rgba(46, 204, 113, 0.15); border-radius: 8px;">
            <strong>💡 Ahorro potencial total:</strong> Aplicando todas las optimizaciones, podrías reducir el consumo en 
            <span style="color: var(--success-color); font-weight: bold;">${((tempReductionSaving + scheduleOptimizationSaving + weekendOptimizationSaving) * 0.85).toFixed(1)} kWh</span> 
            y ahorrar <span style="color: var(--success-color); font-weight: bold;">${((tempReductionCostSaving + scheduleOptimizationCostSaving + weekendOptimizationCostSaving) * 0.85).toFixed(2)} €</span> cada semana.
        </div>
    `;
}

// Función de utilidad para mostrar notificaciones en la interfaz
function showNotification(message, type) {
    // Obtener el contenedor de notificaciones
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.style.position = 'fixed';
        notificationContainer.style.top = '20px';
        notificationContainer.style.right = '20px';
        notificationContainer.style.zIndex = '10000';
        document.body.appendChild(notificationContainer);
    }
    
    // Crear notificación
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.minWidth = '300px';
    notification.style.padding = '15px';
    notification.style.marginBottom = '10px';
    notification.style.borderRadius = '8px';
    notification.style.color = 'white';
    notification.style.fontWeight = '500';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    notification.innerHTML = message;
    
    // Estilos según el tipo
    switch(type) {
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #2ecc71, #27ae60)';
            break;
        case 'warning':
            notification.style.background = 'linear-gradient(135deg, #f39c12, #d35400)';
            break;
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
            break;
        default:
            notification.style.background = 'linear-gradient(135deg, #3498db, #2980b9)';
    }
    
    // Añadir a contenedor
    notificationContainer.appendChild(notification);
    
    // Eliminar después de 5 segundos
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, 5000);
}
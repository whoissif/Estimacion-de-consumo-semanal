// Variables globales
let consumptionData = [];
let weatherForecast = [];
let weeklyChart = null;
let consumptionChart = null;
let currentTab = 'data';

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
    if (tabId === 'results' && consumptionData.length > 0) {
        // Si hay datos, calcular los resultados automáticamente
        setTimeout(calculateWeeklyEstimation, 300);
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
            processData(workbook);
        } catch (error) {
            console.error('Error al procesar el archivo:', error);
            alert('Error al procesar el archivo. Por favor, asegúrate de que sea un archivo Excel válido.');
        }
    };
    reader.readAsArrayBuffer(file);
}

function processData(workbook) {
    // Encontrar la hoja correcta (asumimos que es la primera)
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convertir a JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
    
    // Procesar los datos según el formato de los archivos proporcionados
    consumptionData = parseConsumptionData(jsonData);
    
    // Mostrar datos en la tabla
    displayDataPreview();
    
    // Actualizar gráfico de consumo
    updateConsumptionChart();
    
    // Mostrar mensaje de éxito
    showNotification('✅ Datos cargados correctamente. Puedes cambiar a la pestaña "Análisis y Pronóstico" para continuar.', 'success');
}

function parseConsumptionData(jsonData) {
    const parsedData = [];
    let foundData = false;
    
    // Buscar el inicio de los datos (donde aparece "Fecha" y "Potencia")
    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // Buscar el encabezado de los datos
        if (Array.isArray(row) && row.length >= 2) {
            const cleanCell1 = String(row[0]).trim();
            const cleanCell2 = String(row[1]).trim();
            
            // Detectar inicio de los datos
            if (cleanCell1.includes('Fecha') && cleanCell2.includes('Potencia')) {
                foundData = true;
                continue;
            }
            
            // Procesar datos después del encabezado
            if (foundData && row[0] && row[1] && typeof row[0] === 'string' && !row[0].includes('VALORES CONTINUOS')) {
                // Verificar si es una fecha válida
                const dateStr = String(row[0]).trim();
                const powerStr = String(row[1]).trim();
                
                // Intentar parsear la fecha
                let date;
                try {
                    // Manejar diferentes formatos de fecha
                    if (dateStr.includes('/')) {
                        date = new Date(dateStr.split('/').reverse().join('-'));
                    } else {
                        date = new Date(dateStr);
                    }
                    
                    if (!isNaN(date.getTime())) {
                        const power = parseFloat(powerStr.replace(',', '.'));
                        if (!isNaN(power)) {
                            parsedData.push({
                                date: date,
                                power: power,
                                timestamp: date.getTime()
                            });
                        }
                    }
                } catch (e) {
                    console.log('Error parsing row:', row, e);
                }
            }
        }
    }
    
    // Ordenar por fecha si hay datos
    if (parsedData.length > 0) {
        parsedData.sort((a, b) => a.timestamp - b.timestamp);
    }
    
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
    
    weatherLoading.style.display = 'block';
    weatherContainer.innerHTML = '';
    
    // Simular carga de datos meteorológicos (en una implementación real, aquí iría una llamada a una API)
    setTimeout(() => {
        // Generar pronóstico meteorológico simulado basado en los datos proporcionados
        weatherForecast = generateSimulatedForecast();
        
        // Mostrar el pronóstico
        displayWeatherForecast();
        
        weatherLoading.style.display = 'none';
        showNotification('✅ Pronóstico meteorológico generado correctamente', 'success');
    }, 1500);
}

function generateSimulatedForecast() {
    // Obtener la fecha actual del último dato o usar hoy
    let baseDate = new Date();
    if (consumptionData.length > 0) {
        baseDate = new Date(consumptionData[consumptionData.length - 1].date);
    }
    
    // Asegurarse de que sea el lunes de la semana actual
    baseDate.setDate(baseDate.getDate() + (1 + 7 - baseDate.getDay()) % 7);
    
    // Generar pronóstico para los próximos 7 días
    const forecast = [];
    const location = document.getElementById('location').value;
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() + i);
        
        // Generar temperaturas basadas en el patrón de San Martín de Valdeiglesias en noviembre
        // Lunes a viernes más fríos, fin de semana algo más cálido
        let minTemp, maxTemp;
        if (i < 5) { // Días laborables
            minTemp = -1 + Math.floor(Math.random() * 3); // De -1 a 1°C
            maxTemp = 7 + Math.floor(Math.random() * 4); // De 7 a 10°C
        } else { // Fin de semana
            minTemp = 3 + Math.floor(Math.random() * 3); // De 3 a 5°C
            maxTemp = 12 + Math.floor(Math.random() * 3); // De 12 a 14°C
        }
        
        // Ajustar un poco según el día específico
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
    container.innerHTML = '';
    
    if (weatherForecast.length === 0) {
        container.innerHTML = '<p>No hay datos de pronóstico disponibles. Por favor, genera el pronóstico primero.</p>';
        return;
    }
    
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
    if (temp < 0) return '#3498db'; // Azul para temperaturas bajo cero
    if (temp < 5) return '#2980b9'; // Azul oscuro para frío
    if (temp < 10) return '#3498db'; // Azul para fresco
    if (temp < 15) return '#2ecc71'; // Verde para templado
    return '#e74c3c'; // Rojo para cálido
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
            // Manejar el caso especial del día de cambio (23/11 a 24/11)
            if (item.date.getDate() === 23 && hour >= 14) {
                return item.date.getHours() === hour;
            }
            if (item.date.getDate() === 24 && hour < 8) {
                return item.date.getHours() === hour;
            }
            return item.date.getHours() === hour && item.date.getDate() === 23;
        });
        
        const power = hourData.length > 0 ? 
            hourData.reduce((sum, item) => sum + item.power, 0) / hourData.length : 
            // Si no hay datos para esta hora, interpolar
            (hour < 6 ? initialPower * 0.9 : 
             hour < 10 ? initialPower * 0.8 : 
             hour < 18 ? maintenancePower * 1.1 : 
             initialPower * 0.85);
        
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
    // Cálculo básico para cuando no hay suficientes datos
    const weeklyConsumption = 112.4; // Valor de ejemplo basado en datos iniciales
    
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
        weeklyChart.data.datasets[0].data = [17.8, 18.5, 16.2, 15.4, 15.3, 14.8, 13.6];
        weeklyChart.update();
    }
    
    showNotification('✅ Costes calculados con estimación básica', 'success');
}

function calculateAdvancedEstimation() {
    // 1. Obtener el patrón de consumo
    const consumptionPattern = analyzeConsumptionPattern();
    
    // 2. Calcular consumo diario
    const dailyEstimates = calculateDailyConsumption(consumptionPattern);
    
    // 3. Calcular consumo semanal total
    const weeklyConsumption = dailyEstimates.reduce((sum, day) => sum + day.consumption, 0);
    
    // 4. Calcular distribución por franjas horarias PVPC - CORREGIDO
    const vallePrice = parseFloat(document.getElementById('valle-price').value);
    const llanoPrice = parseFloat(document.getElementById('llano-price').value);
    const puntaPrice = parseFloat(document.getElementById('punta-price').value);
    
    // NUEVO: Calcular consumo por franjas usando los datos diarios reales
    let valleConsumption = 0;
    let llanoConsumption = 0;
    let puntaConsumption = 0;
    
    // Recalcular el patrón horario con los parámetros actualizados
    const hourlyPattern = recalculateHourlyPattern(consumptionPattern);
    
    // Distribuir el consumo semanal por franjas horarias
    hourlyPattern.forEach(hourData => {
        const hour = hourData.hour;
        const dailyConsumption = hourData.power / 1000; // kWh por hora
        
        // Aplicar factores de día laborable vs fin de semana
        let weekdayFactor = 1.0; // Lunes a viernes
        let weekendFactor = 0.85; // Sábado y domingo
        
        if (hour >= 22 || hour < 8) { // Valle: 22:00-8:00
            // 5 días laborables + 2 días fin de semana
            valleConsumption += (dailyConsumption * 5 * weekdayFactor) + (dailyConsumption * 2 * weekendFactor);
        } else if ((hour >= 8 && hour < 10) || (hour >= 14 && hour < 18)) { // Llano
            llanoConsumption += (dailyConsumption * 5 * weekdayFactor) + (dailyConsumption * 2 * weekendFactor);
        } else { // Punta
            puntaConsumption += (dailyConsumption * 5 * weekdayFactor) + (dailyConsumption * 2 * weekendFactor);
        }
    });
    
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
                power: Math.max(500, Math.min(700, maintenancePower * (item.power / 610)))
            };
        }
        return item;
    });
}

function generateOptimizationTips(weeklyConsumption, totalCost) {
    const tipsContainer = document.getElementById('optimization-tips');
    
    // Calcular potenciales ahorros
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

function showNotification(message, type) {
    // Esta función crearía notificaciones emergentes en una implementación completa
    console.log(`${type}: ${message}`);
    
    // En una implementación real, aquí se agregaría HTML para mostrar una notificación
    // pero para este ejemplo, usaremos alert para notificaciones importantes
    if (type === 'warning' || type === 'error') {
        alert(message);
    }
}
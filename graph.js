// graph.js
document.addEventListener('DOMContentLoaded', async function () {
    const graphContainer = document.getElementById('houseGraph');
    if (!graphContainer) return;

    const HOUSES = ['Ambrosius', 'Valerius', 'Nicostratus', 'Sapientia'];

    let totals = HOUSES.reduce((acc, h) => ({ ...acc, [h]: 0 }), {});

    const configured = window.HOUSE_POINTS_CONFIG && window.HOUSE_POINTS_CONFIG.API_BASE_URL;
    const apiBaseUrl = (configured || window.location.origin).replace(/\/$/, '');

    try {
        const res = await fetch(`${apiBaseUrl}/api/standings`);
        if (!res.ok) {
            throw new Error(`Standings request failed: ${res.status}`);
        }

        const payload = await res.json();
        const housePoints = payload.housePoints || {};
        HOUSES.forEach(h => {
            if (housePoints[h] !== undefined) totals[h] = housePoints[h];
        });
    } catch (err) {
        console.error('Failed to fetch house points:', err);
    }

    const houses = HOUSES;
    const points = houses.map(h => totals[h]);

    const houseColors = {
        Ambrosius: '#0000FF',
        Valerius: '#800080',
        Nicostratus: '#008000',
        Sapientia: '#800000'
    };
    const colors = houses.map(h => houseColors[h]);

    new Chart(graphContainer, {
        type: 'bar',
        plugins: [{
            afterDraw: function (chart) {
                const ctx = chart.ctx;
                ctx.font = 'bold 18px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';

                chart.data.datasets.forEach((dataset, i) => {
                    chart.getDatasetMeta(i).data.forEach((bar, index) => {
                        const data = dataset.data[index];
                        ctx.fillText(data, bar.x, bar.y - 10);
                    });
                });
            }
        }],
        data: {
            labels: houses,
            datasets: [{
                label: 'House Points',
                data: points,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 8,
                barPercentage: 0.8,
                categoryPercentage: 0.9
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20 } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#b3b3b3' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#b3b3b3' }
                }
            },
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: 'Total House Points',
                    color: '#ffffff',
                    font: { size: 16, weight: 'bold' },
                    padding: 20
                }
            }
        }
    });
});

// Initialize the graph when the page loads
document.addEventListener('DOMContentLoaded', function () {
    const graphContainer = document.getElementById('houseGraph');
    if (!graphContainer) return;

    const housePoints = JSON.parse(localStorage.getItem('housePoints'));
    const houses = Object.keys(housePoints);
    const points = Object.values(housePoints);

    // House colors
    const houseColors = {
        Ambrosius: '#0000FF', // Blue
        Valerius: '#800080',  // Purple
        Nicostratus: '#008000', // Green
        Sapientia: '#800000'  // Maroon
    };

    const colors = houses.map(house => houseColors[house]);

    new Chart(graphContainer, {
        type: 'bar',
        plugins: [{
            afterDraw: function (chart) {
                var ctx = chart.ctx;
                ctx.font = 'bold 24px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';

                chart.data.datasets.forEach(function (dataset, i) {
                    chart.getDatasetMeta(i).data.forEach(function (bar, index) {
                        var data = dataset.data[index];
                        if (data !== 0) {
                            ctx.fillText(data, bar.x, bar.y);
                        }
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
            layout: {
                padding: {
                    top: 20
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Total House Points',
                    color: '#ffffff',
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: 20
                }
            }
        }
    });
});
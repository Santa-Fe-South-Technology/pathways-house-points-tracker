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
        data: {
            labels: houses,
            datasets: [{
                label: 'House Points',
                data: points,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
});
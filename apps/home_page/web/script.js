// Wait for eel to be ready
document.addEventListener('DOMContentLoaded', function() {
    // Car Counter button
    document.getElementById('carCounterBtn').addEventListener('click', function() {
        eel.launch_car_counter();
    });

    // Park Area button
    document.getElementById('parkAreaBtn').addEventListener('click', function() {
        eel.launch_park_area();
    });
});

const left = document.querySelector('.left')
const right = document.querySelector('.right')
const container = document.querySelector('.container')

left.addEventListener('mouseenter', () => container.classList.add('hover-left'))
left.addEventListener('mouseleave', () => container.classList.remove('hover-left'))

right.addEventListener('mouseenter', () => container.classList.add('hover-right'))
right.addEventListener('mouseleave', () => container.classList.remove('hover-right'))

const container = document.querySelector('.container')
const signUpBtn = document.querySelector('.green-bg button')

signUpBtn.addEventListener('click', () => {
    container.classList.toggle('change');
})

document.getElementById('loginButton').addEventListener('click', async function() {
    const adminId = document.getElementById('adminId').value;
    const password = document.getElementById('password').value;
    
    if(adminId && password) {
        // Call Python function to start homepage
        await eel.start_home_page()();
        // Close current window
        window.close();
    } else {
        alert('Lütfen tüm alanları doldurun!');
    }
});

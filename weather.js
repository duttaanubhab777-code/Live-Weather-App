let searchBox = document.getElementById("search-box");
let searchBtn = document.getElementById("search-button");
let searchBar = document.getElementById("search-bar");
let tempElement = document.getElementById("temp");
let cityElement = document.getElementById("city");

let humidityElement = document.getElementById("humidity");

let windElement = document.getElementById("wind");

let visibilityElement = document.getElementById("visibility");

let pressureElement = document.getElementById("pressure");
let weatherElement = document.getElementById("weather-type");


let sunriseElement = document.getElementById("sunrise");
let sunsetElement = document.getElementById("sunset");










searchBox.addEventListener("submit", (click) =>{
    click.preventDefault();
    
    let cityName = searchBar.value.trim();
    
    let apiKey = ("d3a0f4c0f205e62c85931eac5385b6ba");
    let apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${apiKey}&units=metric`;
    
    
    fetch(apiUrl)
    .then(response => response.json())
    .then(data => { tempElement.textContent = `${data.main.temp}⁰C`;
        cityElement.textContent = data.name;
        humidityElement.textContent = `${data.main.humidity}%`;
windElement.textContent = `${data.wind.speed} km/h`;

visibilityElement.textContent = `${data.visibility/1000} km`;

pressureElement.textContent = `${data.main.pressure} hPa`;

weatherElement.textContent = `${data.weather[0].description} `;


sunriseElement.textContent = new Date(data.sys.sunrise * 1000).toLocaleTimeString();

sunsetElement.textContent = new Date(data.sys.sunset * 1000).toLocaleTimeString();        
        
        
        
        
        
    })
    
    
        .catch(error => {
        // পুরনো alert এর বদলে এই মডার্ন অ্যালার্ট
        Swal.fire({
            icon: "error",
            title: "Oops...",
            text: "City Not Found !! Please check the spelling.",
            confirmButtonColor: "#ffaa00",
            background: "rgba(255, 255, 255, 0.9)",
            
        });
    });
    
}
    );

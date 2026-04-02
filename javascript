const geocode = async (address) => {
  const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(address)}&key=YOUR_KEY`;
  const response = await fetch(url);
  const data = await response.json();
  return {
    lat: data.results[0].geometry.lat,
    lng: data.results[0].geometry.lng
  };
};
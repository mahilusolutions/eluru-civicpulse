const { parseEciOcrText } = require('../services/ocrRoll');

const sample = `Name : saradhi Nalla Name : APPAYYAMMA GAJJALA Name : Gopi Guttela
Mothers Name: Appanna Nalla Husbands Name: NOOKALU GAJJALA Fathers Name: Suryarao Guttela
House Number : 1 Photo House Number : 1 Photo House Number : 1 Photo
Age : 75 Gender : Male Age : 69 Gender : Female Age : 54 Gender : Male
Available Available Available
Name : Vijay pavan kumar Talliboyina Name : JOSHUA DEAN BONIGALA Name : naveen kumar silu
Fathers Name: Samrajyam T Fathers Name: YESUPADARAO BONIGALA Fathers Name: ramesh silu
House Number : 1 Photo House Number : 1 Photo House Number : 1 Photo
Age : 38 Gender : Female Age : 34 Gender : Male Age : 31 Gender : Male`;

const v = parseEciOcrText(sample, 1);
console.log('count', v.length);
console.log(JSON.stringify(v, null, 2));

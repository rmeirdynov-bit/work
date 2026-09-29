# META Rooms — 3D-презентация

Слайды в браузере для выставки инноваций META University (30 сентября, 15:00).
3D-модель корпуса (Three.js) построена по тем же данным, что и демо
[meta-rooms-web.vercel.app](https://meta-rooms-web.vercel.app): 7 этажей, 119 помещений, те же статусы.
Видеосцены сгенерированы в Higgsfield (Kling 3.0) по фото корпуса с meta.edu.kz.

## Показ
Откройте `index.html` в Chrome (двойной клик работает, сборка не нужна).

| Клавиша | Действие |
|---|---|
| `→` `←`, пробел, клик по краю, свайп | слайды |
| `F` | полный экран |
| `A` | автопоказ по кругу (или открыть `index.html?auto`) |
| `H` | подсказка |
| `#5` в адресе | сразу на 5-й слайд |

В автопоказе любое нажатие ставит паузу на 30 секунд, потом показ продолжается.

## Видео и работа без интернета
Видео берутся сначала из `assets/video/`, а если файлов там нет — из CDN Higgsfield.
Чтобы презентация работала без сети, скачайте 5 файлов и положите в `assets/video/` с такими именами:

- `meta-hero.mp4` — https://d2ol7oe51mr4n9.cloudfront.net/user_3IgKH2akcUN4pFd0MnH6W05PVZj/8260fb83-9227-4571-9ab7-98fd93591a6e.mp4
- `meta-problem.mp4` — https://d2ol7oe51mr4n9.cloudfront.net/user_3IgKH2akcUN4pFd0MnH6W05PVZj/ab08cfc8-01af-4406-a01f-8e46e231cb01.mp4
- `meta-hologram.mp4` — https://d2ol7oe51mr4n9.cloudfront.net/user_3IgKH2akcUN4pFd0MnH6W05PVZj/ae1b433f-49c3-4d00-bf2a-11e0b2c79a9e.mp4
- `meta-phone.mp4` — https://d2ol7oe51mr4n9.cloudfront.net/user_3IgKH2akcUN4pFd0MnH6W05PVZj/f49209be-c0e2-4c3c-b603-4e56b842e509.mp4
- `meta-students.mp4` — https://d2ol7oe51mr4n9.cloudfront.net/user_3IgKH2akcUN4pFd0MnH6W05PVZj/69e1aef6-b177-4734-955a-1a497221b8c4.mp4

Шрифты (Unbounded, Rubik), Three.js и QR-код уже лежат локально.

## Разработка
```
npm install
npm run build   # src/*.js → app.js
```
`src/data.js` — этажи и помещения, `src/building.js` — 3D-сцена, `src/main.js` — слайды и автопоказ.

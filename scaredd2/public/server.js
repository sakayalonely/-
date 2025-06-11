app.use(express.static(path.join(__dirname, 'public')));
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer'); // <-- добавлено

const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const bcrypt = require('bcrypt');

const User = require('./models/User');

const app = express();
const PORT = 3000;
const cors = require('cors');
app.use(cors());


// Подключение к MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/your_db_name')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Ошибка подключения к MongoDB', err));


app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID: '725351790342-793rj6gld5shpmkp173edsb8h53cssok.apps.googleusercontent.com',
  clientSecret: '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',
  callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ googleId: profile.id });
    if (!user) {
      user = await User.create({
        googleId: profile.id,
        displayName: profile.displayName,
        email: profile.emails[0].value,
        photo: profile.photos[0].value,
      });
    }
    done(null, user);
  } catch (err) {
    done(err, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  (req, res) => {
    res.redirect('/profile.html');
  }
);

app.get('/api/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.json({ user: null });
  }
});

app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // чтобы парсить данные из формы

// Регистрация
app.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email и пароль обязательны' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      email,
      displayName,
      password: hashedPassword,
    });

    await newUser.save();

    res.json({ message: 'Пользователь зарегистрирован' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Вход
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Неверный email или пароль' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Неверный email или пароль' });
    }

    // Для простоты — логиним без сессий (можно потом добавить сессии или JWT)
    // Но лучше создать сессию:
    req.login(user, (err) => {
      if (err) return res.status(500).json({ message: 'Ошибка при входе' });
      res.json({ message: 'Успешный вход', user: { email: user.email, displayName: user.displayName } });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});


app.post('/api/order', async (req, res) => {
  const order = req.body;
  if (!order || !order.items || order.items.length === 0) {
    return res.status(400).json({ message: 'Пустой заказ' });
  }

  const ordersFile = path.join(__dirname, 'orders.json');
  const orders = fs.existsSync(ordersFile)
    ? JSON.parse(fs.readFileSync(ordersFile, 'utf-8'))
    : [];

  orders.push({
    ...order,
    date: new Date().toISOString()
  });

  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));

  // Отправка письма, если есть email
  if (order.email) {
    const itemsTableRows = order.items.map(item => `
      <tr>
        <td>${item.name}</td>
        <td>${item.size || '-'}</td>
        <td>${item.quantity || 1}</td>
        <td>${item.price ? item.price + '₴' : '-'}</td>
      </tr>
    `).join('');

    const mailOptions = {
      from: '"Himora Tsukiha" <himoratsukiha@gmail.com>',
      to: order.email,
      subject: 'Подтверждение заказа',
      html: `
        <h2>Спасибо за ваш заказ!</h2>
        <p>Мы получили ваш заказ. Вот его детали:</p>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr>
              <th>Название</th>
              <th>Размер</th>
              <th>Количество</th>
              <th>Цена</th>
            </tr>
          </thead>
          <tbody>
            ${itemsTableRows}
          </tbody>
        </table>
        <p>Скоро свяжемся с вами для уточнения доставки.</p>
        <br/>
        <p>— Himora Tsukiha</p>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('Confirmation email sent to', order.email);
    } catch (err) {
      console.error('Failed to send email:', err);
    }
  }

  res.json({ message: 'Заказ принят!' });
});


// Остальное без изменений
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/profile');
  });

app.get('/profile', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  res.send(`
    <h1>Привет, ${req.user.displayName}</h1>
    <img src="${req.user.photo}" alt="avatar" />
    <p>Email: ${req.user.email}</p>
    <a href="/logout">Выйти</a>
  `);
});

app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

app.get('/', (req, res) => {
  res.send(`
    <h1>Главная страница</h1>
    <a href="/auth/google">Войти через Google</a>
  `);
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});

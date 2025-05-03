// db.js

// Importe la classe Pool du module 'pg'
const { Pool } = require('pg');

// Importe et configure dotenv pour charger les variables du fichier .env
// C'est important pour récupérer la DATABASE_URL
require('dotenv').config();

// Crée une instance du Pool de connexions.
// Le constructeur Pool() va automatiquement chercher et utiliser
// la variable d'environnement DATABASE_URL que tu as définie dans le .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon (et beaucoup d'hébergeurs de bases de données cloud) requièrent une connexion SSL.
  // L'option ci-dessous est souvent nécessaire pour les connexions depuis
  // des environnements comme Heroku ou Render, ou même en local vers Neon.
  // Elle désactive la vérification du certificat serveur, ce qui est moins sûr
  // mais souvent requis pour les certificats auto-signés ou par défaut de ces plateformes.
  // Pour une application en production très sensible, il faudrait une configuration SSL plus stricte.
  ssl: {
    rejectUnauthorized: false
  }
});

// Optionnel : Test simple pour vérifier que la connexion au pool fonctionne au démarrage.
// Cela tente d'exécuter une requête simple ('SELECT NOW()') pour confirmer la connexion.
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    // Si une erreur se produit, on l'affiche dans la console du serveur.
    console.error('ERREUR : Impossible de se connecter à la base de données PostgreSQL.', err.stack);
  } else {
    // Si la connexion réussit, on affiche un message de confirmation.
    console.log('Connecté avec succès à la base de données PostgreSQL via le pool.');
    // La ligne ci-dessous affiche l'heure actuelle retournée par la base de données, tu peux la décommenter si tu veux.
    // console.log('Heure actuelle de la base de données :', res.rows[0].now);
  }
});

// Exporte l'objet 'pool' pour qu'il puisse être importé et utilisé
// dans d'autres fichiers de notre application (notamment dans server.js).
module.exports = pool;
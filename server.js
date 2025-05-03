// backend/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Bienvenue sur l\'API de la Liste de Courses Familiale !');
});

// --- API Section: Utilisateurs ---
app.post('/api/users', async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return res.status(400).json({ message: "Le champ 'username' est requis et doit être une chaîne de caractères non vide." });
  }
  const trimmedUsername = username.trim();
  try {
    const findUserQuery = 'SELECT * FROM users WHERE username = $1';
    const { rows } = await pool.query(findUserQuery, [trimmedUsername]);
    if (rows.length > 0) {
      console.log(`Utilisateur trouvé : ${trimmedUsername} (ID: ${rows[0].user_id})`);
      res.status(200).json(rows[0]);
    } else {
      console.log(`Utilisateur non trouvé, création de : ${trimmedUsername}`);
      const insertUserQuery = 'INSERT INTO users (username) VALUES ($1) RETURNING *';
      const result = await pool.query(insertUserQuery, [trimmedUsername]);
      const newUser = result.rows[0];
      console.log(`Utilisateur créé : ${newUser.username} (ID: ${newUser.user_id})`);
      res.status(201).json(newUser);
    }
  } catch (error) {
    console.error("Erreur sur la route POST /api/users :", error.message);
    if (error.code === '23505') {
      return res.status(409).json({ message: "Ce nom d'utilisateur existe déjà (conflit)." });
    }
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});
app.delete('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const id = parseInt(userId, 10);
  if (isNaN(id) || id <= 0) {
     return res.status(400).json({ message: "L'ID utilisateur fourni dans l'URL est invalide." });
  }
  try {
    const deleteQuery = 'DELETE FROM users WHERE user_id = $1 RETURNING *';
    const result = await pool.query(deleteQuery, [id]);
    if (result.rowCount > 0) {
      const deletedUser = result.rows[0];
      console.log(`Utilisateur supprimé : ${deletedUser.username} (ID: ${deletedUser.user_id})`);
      res.status(200).json({ message: 'Utilisateur supprimé avec succès.', user: deletedUser });
    } else {
      console.log(`Tentative de suppression échouée : Utilisateur avec ID ${id} non trouvé.`);
      res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
  } catch (error) {
    console.error(`Erreur sur la route DELETE /api/users/${id} :`, error.message);
    res.status(500).json({ message: 'Erreur interne du serveur lors de la suppression de l\'utilisateur.' });
  }
});
// --- Fin API Utilisateurs ---

// --- API Section: Listes ---
app.post('/api/lists', async (req, res) => {
  const { creator_id, list_name, is_private } = req.body;
  const creatorId = parseInt(creator_id, 10);
  if (isNaN(creatorId) || creatorId <= 0) {
    return res.status(400).json({ message: "Le champ 'creator_id' est requis et doit être un identifiant valide." });
  }
  if (!list_name || typeof list_name !== 'string' || list_name.trim().length === 0) {
    return res.status(400).json({ message: "Le champ 'list_name' est requis et ne peut pas être vide." });
  }
   if (list_name.trim().length > 100) {
      return res.status(400).json({ message: "Le nom de la liste ne peut pas dépasser 100 caractères." });
  }
  const trimmedListName = list_name.trim();
  const listIsPrivate = (typeof is_private === 'boolean' && is_private === true);
  try {
    const userCheckQuery = 'SELECT user_id FROM users WHERE user_id = $1';
    const userCheckResult = await pool.query(userCheckQuery, [creatorId]);
    if (userCheckResult.rowCount === 0) {
      return res.status(404).json({ message: `L'utilisateur créateur avec l'ID ${creatorId} n'existe pas.` });
    }
    const insertListQuery = `INSERT INTO lists (creator_id, list_name, is_private) VALUES ($1, $2, $3) RETURNING *;`;
    const result = await pool.query(insertListQuery, [creatorId, trimmedListName, listIsPrivate]);
    const newList = result.rows[0];
    console.log(`Nouvelle liste créée : "${newList.list_name}" (ID: ${newList.list_id}) par Utilisateur ID: ${newList.creator_id}`);
    res.status(201).json(newList);
  } catch (error) {
    console.error("Erreur sur la route POST /api/lists :", error.message);
    if (error.code === '23503') {
       return res.status(400).json({ message: `L'utilisateur créateur avec l'ID ${creatorId} semble ne plus exister.` });
    }
    res.status(500).json({ message: 'Erreur interne du serveur lors de la création de la liste.' });
  }
});
app.get('/api/lists', async (req, res) => {
  const { userId } = req.query;
  const requestingUserId = parseInt(userId, 10);
  if (isNaN(requestingUserId) || requestingUserId <= 0) {
    return res.status(400).json({ message: "Le paramètre de requête 'userId' est requis et doit être un identifiant valide." });
  }
  try {
    const userCheckQuery = 'SELECT user_id FROM users WHERE user_id = $1';
    const userCheckResult = await pool.query(userCheckQuery, [requestingUserId]);
    if (userCheckResult.rowCount === 0) {
        return res.status(404).json({ message: `L'utilisateur avec l'ID ${requestingUserId} n'existe pas.` });
    }
    const getListsQuery = `
      SELECT l.list_id, l.list_name, l.is_private, l.creator_id, l.created_at, l.updated_at, u.username AS creator_username
      FROM lists l JOIN users u ON l.creator_id = u.user_id
      WHERE l.is_private = FALSE OR (l.is_private = TRUE AND l.creator_id = $1)
      ORDER BY l.created_at DESC;
    `;
    const { rows } = await pool.query(getListsQuery, [requestingUserId]);
    console.log(`Récupération des listes pour l'utilisateur ID ${requestingUserId}: ${rows.length} liste(s) trouvée(s).`);
    res.status(200).json(rows);
  } catch (error) {
    console.error(`Erreur sur la route GET /api/lists?userId=${requestingUserId} :`, error.message);
    res.status(500).json({ message: 'Erreur interne du serveur lors de la récupération des listes.' });
  }
});

// --- Nouvelle Route: GET /api/lists/:listId ---
// Récupère les détails d'une seule liste, si l'utilisateur y a accès
app.get('/api/lists/:listId', async (req, res) => {
    const { listId } = req.params;
    const { userId } = req.query; // L'utilisateur qui demande

    // Validations
    const targetListId = parseInt(listId, 10);
    if (isNaN(targetListId) || targetListId <= 0) {
        return res.status(400).json({ message: "L'ID de liste fourni dans l'URL est invalide." });
    }
    const requestingUserId = parseInt(userId, 10);
    if (isNaN(requestingUserId) || requestingUserId <= 0) {
        return res.status(400).json({ message: "Le paramètre de requête 'userId' est requis et doit être un identifiant valide." });
    }

    try {
        // Récupère les détails de la liste ET le nom du créateur en une seule requête
        const getListDetailsQuery = `
            SELECT
                l.list_id, l.list_name, l.is_private, l.creator_id, l.created_at, l.updated_at,
                u.username AS creator_username
            FROM lists l
            JOIN users u ON l.creator_id = u.user_id
            WHERE l.list_id = $1;
        `;
        const listResult = await pool.query(getListDetailsQuery, [targetListId]);

        // 1. Vérifier si la liste existe
        if (listResult.rowCount === 0) {
            return res.status(404).json({ message: `La liste avec l'ID ${targetListId} n'existe pas.` });
        }

        const listData = listResult.rows[0];

        // 2. Vérifier les permissions d'accès
        const isAllowed = !listData.is_private || listData.creator_id === requestingUserId;

        if (!isAllowed) {
            console.log(`Tentative d'accès non autorisée à la liste privée ID ${targetListId} par l'utilisateur ID ${requestingUserId}`);
            return res.status(403).json({ message: "Accès non autorisé. Cette liste est privée." });
        }

        // 3. Si autorisé, renvoyer les détails de la liste
        console.log(`Accès autorisé aux détails de la liste ID ${targetListId} pour l'utilisateur ID ${requestingUserId}.`);
        res.status(200).json(listData);

    } catch (error) {
        console.error(`Erreur sur la route GET /api/lists/${targetListId}?userId=${requestingUserId} :`, error.message);
        res.status(500).json({ message: 'Erreur interne du serveur lors de la récupération des détails de la liste.' });
    }
});

app.put('/api/lists/:listId', async (req, res) => {
    const { listId } = req.params;
    const { user_id, list_name, is_private } = req.body;
    const targetListId = parseInt(listId, 10);
    if (isNaN(targetListId) || targetListId <= 0) {
        return res.status(400).json({ message: "L'ID de liste fourni dans l'URL est invalide." });
    }
    const requestingUserId = parseInt(user_id, 10);
    if (isNaN(requestingUserId) || requestingUserId <= 0) {
        return res.status(400).json({ message: "Le champ 'user_id' est requis dans le corps de la requête et doit être un identifiant valide." });
    }
    const hasListName = list_name !== undefined && list_name !== null;
    const hasIsPrivate = is_private !== undefined && is_private !== null;
    if (!hasListName && !hasIsPrivate) {
        return res.status(400).json({ message: "Aucun champ à modifier ('list_name' ou 'is_private') n'a été fourni." });
    }
    let trimmedListName;
    if (hasListName) {
         if (typeof list_name !== 'string' || list_name.trim().length === 0) {
            return res.status(400).json({ message: "Le champ 'list_name' fourni ne peut pas être vide." });
        }
        if (list_name.trim().length > 100) {
            return res.status(400).json({ message: "Le nom de la liste ne peut pas dépasser 100 caractères." });
        }
        trimmedListName = list_name.trim();
    }
    let listIsPrivate;
    if (hasIsPrivate) {
         if (typeof is_private !== 'boolean') {
            return res.status(400).json({ message: "Le champ 'is_private' doit être un booléen (true ou false)." });
        }
        listIsPrivate = is_private;
    }
    try {
        const findListQuery = 'SELECT creator_id FROM lists WHERE list_id = $1';
        const listResult = await pool.query(findListQuery, [targetListId]);
        if (listResult.rowCount === 0) {
            return res.status(404).json({ message: `La liste avec l'ID ${targetListId} n'existe pas.` });
        }
        const actualCreatorId = listResult.rows[0].creator_id;
        if (actualCreatorId !== requestingUserId) {
            console.log(`Tentative de modification non autorisée de la liste ID ${targetListId} par l'utilisateur ID ${requestingUserId} (Créateur réel: ${actualCreatorId})`);
            return res.status(403).json({ message: "Action non autorisée. Seul le créateur peut modifier cette liste." });
        }
        const updateFields = [];
        const queryParams = [];
        let paramIndex = 1;
        if (hasListName) {
            updateFields.push(`list_name = $${paramIndex}`);
            queryParams.push(trimmedListName);
            paramIndex++;
        }
        if (hasIsPrivate) {
            updateFields.push(`is_private = $${paramIndex}`);
            queryParams.push(listIsPrivate);
            paramIndex++;
        }
        queryParams.push(targetListId);
        const updateQuery = `UPDATE lists SET ${updateFields.join(', ')} WHERE list_id = $${paramIndex} RETURNING *;`;
        const { rows } = await pool.query(updateQuery, queryParams);
        const updatedList = rows[0];
        console.log(`Liste modifiée : "${updatedList.list_name}" (ID: ${updatedList.list_id}) par Utilisateur ID: ${requestingUserId}`);
        res.status(200).json(updatedList);
    } catch (error) {
        console.error(`Erreur sur la route PUT /api/lists/${targetListId} :`, error.message);
        res.status(500).json({ message: 'Erreur interne du serveur lors de la modification de la liste.' });
    }
});
app.delete('/api/lists/:listId', async (req, res) => {
    const { listId } = req.params;
    const { user_id } = req.body;
    const targetListId = parseInt(listId, 10);
    if (isNaN(targetListId) || targetListId <= 0) {
        return res.status(400).json({ message: "L'ID de liste fourni dans l'URL est invalide." });
    }
    const requestingUserId = parseInt(user_id, 10);
    if (isNaN(requestingUserId) || requestingUserId <= 0) {
        return res.status(400).json({ message: "Le champ 'user_id' est requis dans le corps de la requête pour vérification et doit être un identifiant valide." });
    }
    try {
        const findListQuery = 'SELECT creator_id, list_name FROM lists WHERE list_id = $1';
        const listResult = await pool.query(findListQuery, [targetListId]);
        if (listResult.rowCount === 0) {
            return res.status(404).json({ message: `La liste avec l'ID ${targetListId} n'existe pas.` });
        }
        const { creator_id: actualCreatorId, list_name: listNameToDelete } = listResult.rows[0];
        if (actualCreatorId !== requestingUserId) {
            console.log(`Tentative de suppression non autorisée de la liste ID ${targetListId} ("${listNameToDelete}") par l'utilisateur ID ${requestingUserId} (Créateur réel: ${actualCreatorId})`);
            return res.status(403).json({ message: "Action non autorisée. Seul le créateur peut supprimer cette liste." });
        }
        const deleteListQuery = 'DELETE FROM lists WHERE list_id = $1 RETURNING *';
        const deleteResult = await pool.query(deleteListQuery, [targetListId]);
        if (deleteResult.rowCount > 0) {
             const deletedList = deleteResult.rows[0];
             console.log(`Liste supprimée : "${deletedList.list_name}" (ID: ${deletedList.list_id}) par Utilisateur ID: ${requestingUserId}`);
             res.status(200).json({ message: 'Liste supprimée avec succès.', list: deletedList });
        } else {
             console.error(`Incohérence : Liste ID ${targetListId} trouvée puis non supprimée.`);
             res.status(404).json({ message: 'Erreur lors de la suppression, la liste n\'a pas été trouvée au moment de la suppression.' });
        }
    } catch (error) {
        console.error(`Erreur sur la route DELETE /api/lists/${targetListId} :`, error.message);
        res.status(500).json({ message: 'Erreur interne du serveur lors de la suppression de la liste.' });
    }
});
// --- Fin API Listes ---

// --- API Section: Items ---
app.post('/api/lists/:listId/items', async (req, res) => {
    const { listId } = req.params;
    const { user_id, item_name } = req.body;
    const targetListId = parseInt(listId, 10);
    if (isNaN(targetListId) || targetListId <= 0) {
        return res.status(400).json({ message: "L'ID de liste fourni dans l'URL est invalide." });
    }
    const requestingUserId = parseInt(user_id, 10);
    if (isNaN(requestingUserId) || requestingUserId <= 0) {
        return res.status(400).json({ message: "Le champ 'user_id' est requis dans le corps de la requête et doit être un identifiant valide." });
    }
    if (!item_name || typeof item_name !== 'string' || item_name.trim().length === 0) {
        return res.status(400).json({ message: "Le champ 'item_name' est requis et ne peut pas être vide." });
    }
    if (item_name.trim().length > 255) {
        return res.status(400).json({ message: "Le nom de l'article ne peut pas dépasser 255 caractères." });
    }
    const trimmedItemName = item_name.trim();
    try {
        const findListQuery = 'SELECT creator_id FROM lists WHERE list_id = $1';
        const listResult = await pool.query(findListQuery, [targetListId]);
        if (listResult.rowCount === 0) {
            return res.status(404).json({ message: `La liste avec l'ID ${targetListId} n'existe pas.` });
        }
        const actualCreatorId = listResult.rows[0].creator_id;
        if (actualCreatorId !== requestingUserId) {
            console.log(`Tentative d'ajout d'item non autorisée à la liste ID ${targetListId} par l'utilisateur ID ${requestingUserId} (Créateur réel: ${actualCreatorId})`);
            return res.status(403).json({ message: "Action non autorisée. Seul le créateur de la liste peut y ajouter des articles." });
        }
        const insertItemQuery = `INSERT INTO items (list_id, item_name) VALUES ($1, $2) RETURNING *;`;
        const { rows } = await pool.query(insertItemQuery, [targetListId, trimmedItemName]);
        const newItem = rows[0];
        console.log(`Nouvel article ajouté : "${newItem.item_name}" (ID: ${newItem.item_id}) à la liste ID ${targetListId}`);
        res.status(201).json(newItem);
    } catch (error) {
        console.error(`Erreur sur la route POST /api/lists/${targetListId}/items :`, error.message);
         if (error.code === '23503') {
             return res.status(404).json({ message: `La liste avec l'ID ${targetListId} semble ne plus exister.` });
         }
        res.status(500).json({ message: 'Erreur interne du serveur lors de l\'ajout de l\'article.' });
    }
});
app.get('/api/lists/:listId/items', async (req, res) => {
    const { listId } = req.params;
    const { userId } = req.query;
    const targetListId = parseInt(listId, 10);
    if (isNaN(targetListId) || targetListId <= 0) {
        return res.status(400).json({ message: "L'ID de liste fourni dans l'URL est invalide." });
    }
    const requestingUserId = parseInt(userId, 10);
    if (isNaN(requestingUserId) || requestingUserId <= 0) {
        return res.status(400).json({ message: "Le paramètre de requête 'userId' est requis et doit être un identifiant valide." });
    }
    try {
        // On vérifie d'abord si l'utilisateur a accès à la liste !
        const findListQuery = 'SELECT creator_id, is_private FROM lists WHERE list_id = $1';
        const listResult = await pool.query(findListQuery, [targetListId]);
        if (listResult.rowCount === 0) {
            return res.status(404).json({ message: `La liste avec l'ID ${targetListId} n'existe pas.` });
        }
        const { creator_id: actualCreatorId, is_private: listIsPrivate } = listResult.rows[0];
        if (listIsPrivate && actualCreatorId !== requestingUserId) {
            console.log(`Tentative d'accès non autorisée aux items de la liste privée ID ${targetListId} par l'utilisateur ID ${requestingUserId}`);
            return res.status(403).json({ message: "Accès non autorisé. Cette liste est privée." });
        }
        // Si accès autorisé, on récupère les items
        const getItemsQuery = `SELECT * FROM items WHERE list_id = $1 ORDER BY created_at ASC;`;
        const { rows } = await pool.query(getItemsQuery, [targetListId]);
        console.log(`Récupération des articles pour la liste ID ${targetListId} (demandé par User ID ${requestingUserId}): ${rows.length} article(s) trouvé(s).`);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Erreur sur la route GET /api/lists/${targetListId}/items :`, error.message);
        res.status(500).json({ message: 'Erreur interne du serveur lors de la récupération des articles.' });
    }
});
app.put('/api/items/:itemId', async (req, res) => {
    const { itemId } = req.params;
    const { user_id, item_name, is_checked } = req.body;
    const targetItemId = parseInt(itemId, 10);
    if (isNaN(targetItemId) || targetItemId <= 0) {
        return res.status(400).json({ message: "L'ID d'article fourni dans l'URL est invalide." });
    }
    const requestingUserId = parseInt(user_id, 10);
    if (isNaN(requestingUserId) || requestingUserId <= 0) {
        return res.status(400).json({ message: "Le champ 'user_id' est requis dans le corps de la requête et doit être un identifiant valide." });
    }
    const hasItemName = item_name !== undefined && item_name !== null;
    const hasIsChecked = is_checked !== undefined && is_checked !== null;
    if (!hasItemName && !hasIsChecked) {
        return res.status(400).json({ message: "Aucun champ à modifier ('item_name' ou 'is_checked') n'a été fourni." });
    }
    let trimmedItemName;
    if (hasItemName) {
        if (typeof item_name !== 'string' || item_name.trim().length === 0) {
            return res.status(400).json({ message: "Le champ 'item_name' fourni ne peut pas être vide." });
        }
         if (item_name.trim().length > 255) {
            return res.status(400).json({ message: "Le nom de l'article ne peut pas dépasser 255 caractères." });
        }
        trimmedItemName = item_name.trim();
    }
    let itemIsChecked;
    if (hasIsChecked) {
        if (typeof is_checked !== 'boolean') {
            return res.status(400).json({ message: "Le champ 'is_checked' doit être un booléen (true ou false)." });
        }
        itemIsChecked = is_checked;
    }
    try {
        const getItemAndListInfoQuery = `
            SELECT i.item_id, i.list_id, l.creator_id AS list_creator_id, l.is_private AS list_is_private
            FROM items i JOIN lists l ON i.list_id = l.list_id WHERE i.item_id = $1;
        `;
        const itemResult = await pool.query(getItemAndListInfoQuery, [targetItemId]);
        if (itemResult.rowCount === 0) {
            return res.status(404).json({ message: `L'article avec l'ID ${targetItemId} n'existe pas.` });
        }
        const { list_creator_id, list_is_private } = itemResult.rows[0];
        let canUpdate = true;
        if (hasItemName && requestingUserId !== list_creator_id) {
            canUpdate = false;
            console.log(`Tentative de modification du nom de l'item ID ${targetItemId} par User ID ${requestingUserId} (non créateur de la liste)`);
            return res.status(403).json({ message: "Action non autorisée. Seul le créateur de la liste peut modifier le nom d'un article." });
        }
        if (canUpdate && hasIsChecked) {
            const userHasAccessToList = !list_is_private || requestingUserId === list_creator_id;
            if (!userHasAccessToList) {
                canUpdate = false;
                console.log(`Tentative de cochage/décochage de l'item ID ${targetItemId} par User ID ${requestingUserId} (liste privée non accessible)`);
                return res.status(403).json({ message: "Action non autorisée. Vous ne pouvez pas modifier l'état (coché/décoché) d'un article sur cette liste privée." });
            }
        }
        const updateFields = [];
        const queryParams = [];
        let paramIndex = 1;
        if (hasItemName) {
            updateFields.push(`item_name = $${paramIndex}`);
            queryParams.push(trimmedItemName);
            paramIndex++;
        }
        if (hasIsChecked) {
            updateFields.push(`is_checked = $${paramIndex}`);
            queryParams.push(itemIsChecked);
            paramIndex++;
        }
        queryParams.push(targetItemId);
        const updateQuery = `UPDATE items SET ${updateFields.join(', ')} WHERE item_id = $${paramIndex} RETURNING *;`;
        const { rows } = await pool.query(updateQuery, queryParams);
        const updatedItem = rows[0];
        console.log(`Article modifié : "${updatedItem.item_name}" (ID: ${updatedItem.item_id}), is_checked: ${updatedItem.is_checked}`);
        res.status(200).json(updatedItem);
    } catch (error) {
        console.error(`Erreur sur la route PUT /api/items/${targetItemId} :`, error.message);
        res.status(500).json({ message: 'Erreur interne du serveur lors de la modification de l\'article.' });
    }
});
app.delete('/api/items/:itemId', async (req, res) => {
    const { itemId } = req.params;
    const { user_id } = req.body;
    const targetItemId = parseInt(itemId, 10);
    if (isNaN(targetItemId) || targetItemId <= 0) {
        return res.status(400).json({ message: "L'ID d'article fourni dans l'URL est invalide." });
    }
    const requestingUserId = parseInt(user_id, 10);
    if (isNaN(requestingUserId) || requestingUserId <= 0) {
        return res.status(400).json({ message: "Le champ 'user_id' est requis dans le corps de la requête pour vérification et doit être un identifiant valide." });
    }
    try {
        const getItemAndListInfoQuery = `
            SELECT i.item_id, i.item_name, l.creator_id AS list_creator_id
            FROM items i JOIN lists l ON i.list_id = l.list_id WHERE i.item_id = $1;
        `;
        const itemResult = await pool.query(getItemAndListInfoQuery, [targetItemId]);
        if (itemResult.rowCount === 0) {
            return res.status(404).json({ message: `L'article avec l'ID ${targetItemId} n'existe pas.` });
        }
        const { list_creator_id, item_name: itemNameToDelete } = itemResult.rows[0];
        if (list_creator_id !== requestingUserId) {
            console.log(`Tentative de suppression non autorisée de l'item ID ${targetItemId} ("${itemNameToDelete}") par l'utilisateur ID ${requestingUserId} (Créateur liste: ${list_creator_id})`);
            return res.status(403).json({ message: "Action non autorisée. Seul le créateur de la liste peut supprimer ses articles." });
        }
        const deleteItemQuery = 'DELETE FROM items WHERE item_id = $1 RETURNING *';
        const deleteResult = await pool.query(deleteItemQuery, [targetItemId]);
         if (deleteResult.rowCount > 0) {
             const deletedItem = deleteResult.rows[0];
             console.log(`Article supprimé : "${deletedItem.item_name}" (ID: ${deletedItem.item_id}) par Utilisateur ID: ${requestingUserId}`);
             res.status(200).json({ message: 'Article supprimé avec succès.', item: deletedItem });
        } else {
             console.error(`Incohérence : Article ID ${targetItemId} trouvé puis non supprimé.`);
             res.status(404).json({ message: 'Erreur lors de la suppression, l\'article n\'a pas été trouvé au moment de la suppression.' });
        }
    } catch (error) {
        console.error(`Erreur sur la route DELETE /api/items/${targetItemId} :`, error.message);
        res.status(500).json({ message: 'Erreur interne du serveur lors de la suppression de l\'article.' });
    }
});
// --- Fin API Items ---

app.listen(port, () => {
  console.log(`Serveur démarré et écoute sur http://localhost:${port}`);
});
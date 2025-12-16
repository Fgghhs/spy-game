import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCpguteler5EgFExUKULrugh9KJySv3U3M",
  authDomain: "spy-game-86863.firebaseapp.com",
  databaseURL: "https://spy-game-86863-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "spy-game-86863",
  storageBucket: "spy-game-86863.firebasestorage.app",
  messagingSenderId: "17246930744",
  appId: "1:17246930744:web:6383e51bdbccd17ea563cd"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
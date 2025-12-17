import React, { useState, useEffect } from 'react';
import { Users, LogIn, Plus, Crown, User, Copy, Check, Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { database } from './firebase';
import { ref, set, push, onValue, remove, update } from 'firebase/database';
import itemList from './items/itemlist.json';


export default function SpyGame() {
  const [screen, setScreen] = useState('home'); // 'home', 'room', 'game'
  const [joinName, setJoinName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [createRoomName, setCreateRoomName] = useState('');
  const [playerCount, setPlayerCount] = useState(4);
  
  const [roomData, setRoomData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPlayerId, setCurrentPlayerId] = useState(null);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  
  // Игровые данные
  const [gameData, setGameData] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [roleRevealed, setRoleRevealed] = useState(false);

  const [votingPhase, setVotingPhase] = useState(false);
  const [myVote, setMyVote] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [decisionPhase, setDecisionPhase] = useState(false);
  const [myDecision, setMyDecision] = useState(null);



  // Слушаем изменения в комнате
  useEffect(() => {
    if (roomData && roomData.roomId) {
      const roomRef = ref(database, `rooms/${roomData.roomId}`);
      
      const unsubscribe = onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setRoomData(prev => ({
            ...prev,
            roomName: data.roomName,
            maxPlayers: data.maxPlayers,
            players: data.players ? Object.entries(data.players).map(([id, player]) => ({
              id,
              ...player
            })) : []
          }));
          
          // Если игра началась или рестартила
          if (data.gameStarted && data.game) {
            setGameData(data.game);
            setScreen('game');
            
            // Определяем роль текущего игрока (обновляется при каждом изменении!)
            if (data.game.roles && data.game.roles[currentPlayerId]) {
              setMyRole(data.game.roles[currentPlayerId]);
            }
          } else if (!data.gameStarted) {
            // Если игра не началась - возвращаем в лобби
            setScreen('room');
            setGameData(null);
            setMyRole(null);
            setRoleRevealed(false);
          }
        } else {
          setError('Комната была закрыта');
          setTimeout(() => {
            setScreen('home');
            setRoomData(null);
          }, 2000);
        }
      });

      return () => unsubscribe();
    }
  }, [roomData?.roomId, currentPlayerId]);

  useEffect(() => {
    if (gameData) {
      // Обработка фазы решения
      if (gameData.decisionPhase) {
        setDecisionPhase(true);
        if (gameData.decisions) {
          checkDecisionResults();
        }
      } else {
        setDecisionPhase(false);
        setMyDecision(null);
      }
      
      // Обработка фазы голосования
      if (gameData.votingPhase) {
        setVotingPhase(true);
        if (gameData.votes) {
          checkVotingResults();
        }
      } else {
        setVotingPhase(false);
        setMyVote(null);
      }
      
      // ИСПРАВЛЕНИЕ: обрабатываем ОБА случая - и когда игра окончена, и когда рестартит
      if (gameData.gameOver) {
        setGameOver(true);
        setWinner(gameData.winner);
      } else {
        // При рестарте игры сбрасываем все состояния
        setGameOver(false);
        setWinner(null);
        setRoleRevealed(false); // Скрываем роль для новой игры
      }
    }
  }, [gameData]);

  // Текстовый чат
  useEffect(() => {
    if (roomData && roomData.roomId && screen === 'game') {
      const chatRef = ref(database, `rooms/${roomData.roomId}/chat`);
      
      const unsubscribe = onValue(chatRef, (snapshot) => {
        const messages = snapshot.val();
        if (messages) {
          const messageList = Object.entries(messages).map(([id, msg]) => ({
            id,
            ...msg
          })).sort((a, b) => a.timestamp - b.timestamp);
          setChatMessages(messageList);
        } else {
          setChatMessages([]);
        }
      });

      return () => unsubscribe();
    }
  }, [roomData?.roomId, screen]);

  const sendMessage = async () => {
    if (!chatInput.trim() || !roomData || !currentPlayerId) return;
    
    const currentPlayer = roomData.players.find(p => p.id === currentPlayerId);
    
    try {
      const messageRef = push(ref(database, `rooms/${roomData.roomId}/chat`));
      await set(messageRef, {
        playerId: currentPlayerId,
        playerName: currentPlayer?.name || 'Неизвестный',
        message: chatInput.trim(),
        timestamp: Date.now()
      });
      
      setChatInput('');
    } catch (err) {
      console.error('Ошибка отправки сообщения:', err);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinName || !joinRoomId) {
      setError('Заполните все поля!');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const roomRef = ref(database, `rooms/${joinRoomId}`);
      
      onValue(roomRef, async (snapshot) => {
        const room = snapshot.val();
        
        if (!room) {
          setError('Комната не найдена!');
          setLoading(false);
          return;
        }

        if (room.gameStarted) {
          setError('Игра уже началась!');
          setLoading(false);
          return;
        }

        const currentPlayers = room.players ? Object.keys(room.players).length : 0;
        
        if (currentPlayers >= room.maxPlayers) {
          setError('Комната заполнена!');
          setLoading(false);
          return;
        }

        const newPlayerRef = push(ref(database, `rooms/${joinRoomId}/players`));
        await set(newPlayerRef, {
          name: joinName,
          isHost: false,
          joinedAt: Date.now()
        });

        setCurrentPlayerId(newPlayerRef.key);
        setRoomData({
          roomId: joinRoomId,
          roomName: room.roomName,
          maxPlayers: room.maxPlayers,
          players: [],
          currentPlayer: joinName,
          isHost: false
        });
        
        setScreen('room');
        setLoading(false);
      }, { onlyOnce: true });

    } catch (err) {
      console.error(err);
      setError('Ошибка подключения');
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!joinName || !createRoomName || playerCount < 3) {
      setError('Заполните все поля! Минимум 3 участника.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const roomRef = ref(database, `rooms/${newRoomId}`);
      
      const hostPlayerRef = push(ref(database, `rooms/${newRoomId}/players`));
      
      await set(roomRef, {
        roomName: createRoomName,
        maxPlayers: playerCount,
        createdAt: Date.now(),
        gameStarted: false,
        players: {
          [hostPlayerRef.key]: {
            name: joinName,
            isHost: true,
            joinedAt: Date.now()
          }
        }
      });

      setCurrentPlayerId(hostPlayerRef.key);
      setRoomData({
        roomId: newRoomId,
        roomName: createRoomName,
        maxPlayers: playerCount,
        players: [],
        currentPlayer: joinName,
        isHost: true
      });
      
      setScreen('room');
      setLoading(false);
      
    } catch (err) {
      console.error(err);
      setError('Ошибка создания комнаты');
      setLoading(false);
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomData.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveRoom = async () => {
    if (roomData && currentPlayerId) {
      try {
        if (roomData.isHost) {
          await remove(ref(database, `rooms/${roomData.roomId}`));
        } else {
          await remove(ref(database, `rooms/${roomData.roomId}/players/${currentPlayerId}`));
        }
      } catch (err) {
        console.error(err);
      }
    }
    
    setScreen('home');
    setRoomData(null);
    setCurrentPlayerId(null);
    setJoinName('');
    setJoinRoomId('');
    setCreateRoomName('');
    setGameData(null);
    setMyRole(null);
    setRoleRevealed(false);
  };

  const getRandomItem = () => {
    const randomIndex = Math.floor(Math.random() * itemList.length);
    const item = itemList[randomIndex];
    
    return {
      id: item.id,
      name: item.name,
      query: item.query,
      // Путь к изображению (если у вас есть изображения)
      image: process.env.PUBLIC_URL + `/images/${item.name}.png`
      // Или если изображений нет, можно использовать placeholder
      // image: `https://via.placeholder.com/150?text=${item.name}`
    };
  };

  const startGame = async () => {
    if (!roomData || roomData.players.length < 3) return;

    try {
      const playerIds = roomData.players.map(p => p.id);
      
      const spyIndex = Math.floor(Math.random() * playerIds.length);
      const spyId = playerIds[spyIndex];
      
      const roles = {};
      playerIds.forEach(id => {
        roles[id] = id === spyId ? 'spy' : 'civilian';
      });
      
      const turnOrder = [...playerIds].sort(() => Math.random() - 0.5);
      
      const gameState = {
        item: getRandomItem(), // ← ИЗМЕНИЛИ ЭТО
        roles: roles,
        turnOrder: turnOrder,
        currentTurnIndex: 0,
        currentTurnPlayer: turnOrder[0],
        round: 1,
        votingPhase: false,
        votes: {},
        decisionPhase: false,
        decisions: {},
        gameOver: false,
        winner: null
      };
      
      await update(ref(database, `rooms/${roomData.roomId}`), {
        gameStarted: true,
        game: gameState
      });
      
    } catch (err) {
      console.error(err);
      setError('Ошибка запуска игры');
    }
  };

  const voteForPlayer = async (playerId) => {
    if (!gameData || !roomData || myVote) return;
    
    setMyVote(playerId);
    
    await update(ref(database, `rooms/${roomData.roomId}/game/votes`), {
      [currentPlayerId]: playerId
    });
  };

  const checkVotingResults = async () => {
    if (!gameData || !gameData.votes) return;
    
    const votes = gameData.votes;
    const voteCount = Object.keys(votes).length;
    
    // Если все проголосовали
    if (voteCount === roomData.players.length) {
      // Подсчитываем голоса
      const voteCounts = {};
      Object.values(votes).forEach(votedId => {
        voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
      });
      
      // Находим игрока с максимальным количеством голосов
      let maxVotes = 0;
      let votedOutPlayer = null;
      
      Object.entries(voteCounts).forEach(([playerId, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          votedOutPlayer = playerId;
        }
      });
      
      // Проверяем, был ли выгнан шпион
      const votedOutRole = gameData.roles[votedOutPlayer];
      
      if (votedOutRole === 'spy') {
        // Мирные победили
        await endGame('civilians', votedOutPlayer);
      } else {
        // Шпион победил
        const spyId = Object.entries(gameData.roles).find(([id, role]) => role === 'spy')[0];
        await endGame('spy', votedOutPlayer, spyId);
      }
    }
  };

  const nextTurn = async () => {
    if (!gameData || !roomData) return;
    
    const nextIndex = (gameData.currentTurnIndex + 1) % gameData.turnOrder.length;
    
    // Если круг завершился - начинаем голосование на решение
    if (nextIndex === 0) {
      await update(ref(database, `rooms/${roomData.roomId}/game`), {
        decisionPhase: true,
        decisions: {},
        round: gameData.round + 1
      });
    } else {
      // Обычный переход хода
      const nextPlayer = gameData.turnOrder[nextIndex];
      await update(ref(database, `rooms/${roomData.roomId}/game`), {
        currentTurnIndex: nextIndex,
        currentTurnPlayer: nextPlayer
      });
    }
  };

  const makeDecision = async (decision) => {
    if (!gameData || !roomData || myDecision) return;
    
    setMyDecision(decision);
    
    await update(ref(database, `rooms/${roomData.roomId}/game/decisions`), {
      [currentPlayerId]: decision
    });
  };

  const checkDecisionResults = async () => {
  if (!gameData || !gameData.decisions) return;
  
  const decisions = gameData.decisions;
  const decisionCount = Object.keys(decisions).length;
  
  // Если все проголосовали
  if (decisionCount === roomData.players.length) {
      const voteYes = Object.values(decisions).filter(d => d === 'vote').length;
      const voteContinue = Object.values(decisions).filter(d => d === 'continue').length;
      
      if (voteYes > voteContinue) {
        // Начинаем голосование за шпиона
        await update(ref(database, `rooms/${roomData.roomId}/game`), {
          decisionPhase: false,
          votingPhase: true,
          votes: {}
        });
      } else {
        // Продолжаем игру
        const nextPlayer = gameData.turnOrder[0];
        await update(ref(database, `rooms/${roomData.roomId}/game`), {
          decisionPhase: false,
          decisions: {},
          currentTurnIndex: 0,
          currentTurnPlayer: nextPlayer
        });
      }
    }
  };

  const endGame = async (winnerSide, votedOutPlayer, spyId = null) => {
    await update(ref(database, `rooms/${roomData.roomId}/game`), {
      gameOver: true,
      winner: winnerSide,
      votedOutPlayer: votedOutPlayer,
      spyId: spyId || Object.entries(gameData.roles).find(([id, role]) => role === 'spy')[0]
    });
  };

  const restartGame = async () => {
    if (!roomData || !roomData.isHost) return;
    
    const playerIds = roomData.players.map(p => p.id);
    
    const spyIndex = Math.floor(Math.random() * playerIds.length);
    const spyId = playerIds[spyIndex];
    
    const roles = {};
    playerIds.forEach(id => {
      roles[id] = id === spyId ? 'spy' : 'civilian';
    });
    
    const turnOrder = [...playerIds].sort(() => Math.random() - 0.5);
    
    const gameState = {
      item: getRandomItem(), // ← ИЗМЕНИЛИ ЭТО
      roles: roles,
      turnOrder: turnOrder,
      currentTurnIndex: 0,
      currentTurnPlayer: turnOrder[0],
      round: 1,
      votingPhase: false,
      votes: {},
      decisionPhase: false,
      decisions: {},
      gameOver: false,
      winner: null
    };
    
    await update(ref(database, `rooms/${roomData.roomId}`), {
      game: gameState
    });
    
    setMyVote(null);
    setMyDecision(null);
    setGameOver(false);
    setWinner(null);
    setRoleRevealed(false);
    setDecisionPhase(false);
    setVotingPhase(false);
  };

  if (screen === 'game' && gameOver && gameData) {
    const votedOutPlayer = roomData.players.find(p => p.id === gameData.votedOutPlayer);
    const spyPlayer = roomData.players.find(p => p.id === gameData.spyId);
    const iWasSpy = myRole === 'spy';
    const iWon = (winner === 'civilians' && !iWasSpy) || (winner === 'spy' && iWasSpy);
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 flex items-center justify-center">
        <div className="max-w-2xl w-full">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 shadow-2xl text-center">
            <h1 className={`text-5xl font-bold mb-6 ${iWon ? 'text-green-400' : 'text-red-400'}`}>
              {iWon ? '🎉 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ'}
            </h1>
            
            <div className="bg-white/10 rounded-xl p-6 mb-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                {winner === 'civilians' ? '👥 Победили мирные!' : '🕵️ Победил шпион!'}
              </h2>
              
              <div className="space-y-4 text-lg">
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-purple-200 mb-1">Выгнали:</p>
                  <p className="text-white font-bold text-xl">{votedOutPlayer?.name}</p>
                </div>
                
                <div className="bg-red-500/20 rounded-lg p-4 border border-red-500/30">
                  <p className="text-purple-200 mb-1">Шпионом был:</p>
                  <p className="text-red-400 font-bold text-xl">{spyPlayer?.name}</p>
                </div>
                
                <div className="bg-blue-500/20 rounded-lg p-6 border border-blue-500/30">
                  <p className="text-purple-200 mb-3">Предметом был:</p>
                  
                  {gameData.item.image && (
                    <div className="mb-4">
                      <img 
                        src={gameData.item.image} 
                        alt={gameData.item.name}
                        className="w-32 h-32 mx-auto object-contain bg-white/10 rounded-lg p-2"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  
                  <p className="text-white font-bold text-2xl">{gameData.item.name}</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              {roomData.isHost && (
                <button
                  onClick={restartGame}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-105 shadow-lg"
                >
                  🔄 Начать новую игру
                </button>
              )}
              
              <button
                onClick={leaveRoom}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-all"
              >
                Выйти из комнаты
              </button>
              
              {!roomData.isHost && (
                <p className="text-purple-300 text-sm mt-2">
                  Ожидание хоста для начала новой игры...
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'game' && decisionPhase && gameData && !gameOver) {
    const allDecided = gameData.decisions && Object.keys(gameData.decisions).length === roomData.players.length;
    const voteCount = gameData.decisions ? Object.values(gameData.decisions).filter(d => d === 'vote').length : 0;
    const continueCount = gameData.decisions ? Object.values(gameData.decisions).filter(d => d === 'continue').length : 0;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">🤔 Принятие решения</h1>
                <p className="text-purple-200">Раунд {gameData.round} завершен</p>
              </div>
              <button
                onClick={leaveRoom}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
              >
                Выйти
              </button>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl mb-6">
            <h2 className="text-2xl font-bold text-white mb-4 text-center">
              {myDecision ? '✅ Вы сделали выбор' : 'Что делать дальше?'}
            </h2>
            
            <p className="text-center text-purple-200 mb-6">
              Решили: {gameData.decisions ? Object.keys(gameData.decisions).length : 0} / {roomData.players.length}
            </p>

            {!allDecided && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <button
                  onClick={() => makeDecision('vote')}
                  disabled={myDecision !== null}
                  className={`p-6 rounded-xl transition-all ${
                    myDecision === 'vote'
                      ? 'bg-red-500/30 border-2 border-red-500 transform scale-105'
                      : myDecision
                      ? 'bg-white/5 opacity-50 cursor-not-allowed'
                      : 'bg-red-500/20 hover:bg-red-500/30 border-2 border-red-500/50 cursor-pointer transform hover:scale-105'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-4xl mb-2">⚖️</div>
                    <h3 className="text-white font-bold text-lg mb-2">Голосовать за шпиона</h3>
                    <p className="text-purple-200 text-sm">Пора найти предателя</p>
                  </div>
                </button>

                <button
                  onClick={() => makeDecision('continue')}
                  disabled={myDecision !== null}
                  className={`p-6 rounded-xl transition-all ${
                    myDecision === 'continue'
                      ? 'bg-green-500/30 border-2 border-green-500 transform scale-105'
                      : myDecision
                      ? 'bg-white/5 opacity-50 cursor-not-allowed'
                      : 'bg-green-500/20 hover:bg-green-500/30 border-2 border-green-500/50 cursor-pointer transform hover:scale-105'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-4xl mb-2">▶️</div>
                    <h3 className="text-white font-bold text-lg mb-2">Продолжить игру</h3>
                    <p className="text-purple-200 text-sm">Нужно больше информации</p>
                  </div>
                </button>
              </div>
            )}

            {allDecided && (
              <div className="bg-blue-500/20 border border-blue-500/50 rounded-xl p-6 mb-6">
                <p className="text-blue-400 font-bold text-lg text-center mb-4">
                  Все решили! Подсчет голосов...
                </p>
                <div className="flex justify-center gap-8 text-center">
                  <div>
                    <p className="text-3xl font-bold text-red-400">{voteCount}</p>
                    <p className="text-purple-200 text-sm">За голосование</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-green-400">{continueCount}</p>
                    <p className="text-purple-200 text-sm">За продолжение</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Список игроков и их решений */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Игроки</h3>
            <div className="space-y-2">
              {roomData.players.map((player) => {
                const playerDecision = gameData.decisions && gameData.decisions[player.id];
                
                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-white font-medium">{player.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {playerDecision ? (
                        <>
                          <span className="text-green-400 text-sm">✓ Решил</span>
                          {playerDecision === 'vote' && (
                            <span className="text-red-400 text-xs">⚖️</span>
                          )}
                          {playerDecision === 'continue' && (
                            <span className="text-green-400 text-xs">▶️</span>
                          )}
                        </>
                      ) : (
                        <span className="text-purple-300 text-sm">Думает...</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'game' && votingPhase && gameData && !gameOver) {
    const allVoted = gameData.votes && Object.keys(gameData.votes).length === roomData.players.length;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">⚖️ Голосование за шпиона</h1>
                <p className="text-purple-200">Раунд {gameData.round}</p>
              </div>
              <button
                onClick={leaveRoom}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
              >
                Выйти
              </button>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl mb-6">
            <h2 className="text-2xl font-bold text-white mb-4 text-center">
              {myVote ? '✅ Вы проголосовали' : '🔍 Кто по-вашему шпион?'}
            </h2>
            
            <p className="text-center text-purple-200 mb-6">
              Проголосовало: {gameData.votes ? Object.keys(gameData.votes).length : 0} / {roomData.players.length}
            </p>

            <div className="space-y-3">
              {roomData.players.map((player) => {
                const hasVoted = gameData.votes && gameData.votes[player.id];
                const iVotedForThis = myVote === player.id;
                
                return (
                  <button
                    key={player.id}
                    onClick={() => !myVote && voteForPlayer(player.id)}
                    disabled={myVote !== null}
                    className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
                      iVotedForThis
                        ? 'bg-yellow-500/30 border-2 border-yellow-500'
                        : myVote
                        ? 'bg-white/5 opacity-50 cursor-not-allowed'
                        : 'bg-white/10 hover:bg-white/20 border-2 border-white/20 cursor-pointer transform hover:scale-105'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-white font-bold text-lg">{player.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {hasVoted && (
                        <span className="text-green-400 text-sm">✓ Проголосовал</span>
                      )}
                      {iVotedForThis && (
                        <span className="text-yellow-400 font-bold">← Ваш выбор</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {allVoted && (
            <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-6 text-center">
              <p className="text-green-400 font-bold text-lg">
                Все проголосовали! Подсчет результатов...
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Экран игры
  if (screen === 'game' && gameData && myRole) {
    const currentPlayer = roomData.players.find(p => p.id === gameData.currentTurnPlayer);
    const isMyTurn = gameData.currentTurnPlayer === currentPlayerId;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">{roomData.roomName}</h1>
                <p className="text-purple-200">Раунд {gameData.round}</p>
              </div>
              <button
                onClick={leaveRoom}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
              >
                Выйти
              </button>
            </div>
          </div>

          {/* Карточка роли */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Ваша роль</h2>
            
            {!roleRevealed ? (
              <button
                onClick={() => setRoleRevealed(true)}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-8 rounded-xl transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-3"
              >
                <Eye className="w-6 h-6" />
                Нажмите, чтобы узнать свою роль
              </button>
            ) : (
              <div className={`p-6 rounded-xl border-2 ${
                myRole === 'spy' 
                  ? 'bg-red-500/20 border-red-500' 
                  : 'bg-green-500/20 border-green-500'
              }`}>
                <div className="text-center">
                  <h3 className={`text-3xl font-bold mb-4 ${
                    myRole === 'spy' ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {myRole === 'spy' ? '🕵️ ВЫ ШПИОН' : '👤 ВЫ МИРНЫЙ'}
                  </h3>
                  
                  {myRole === 'civilian' && (
                    <div className="bg-white/10 p-4 rounded-lg mt-4">
                      {gameData.item.image && (
                        <img 
                          src={gameData.item.image} 
                          alt={gameData.item.name}
                          className="w-32 h-32 mx-auto mb-4 object-contain"
                          onError={(e) => {
                            // Если изображение не загрузилось, скрываем его
                            e.target.style.display = 'none';
                          }}
                        />
                      )}
                      <p className="text-purple-200 mb-2">Ваш предмет:</p>
                      <p className="text-white text-2xl font-bold">{gameData.item.name}</p>
                    </div>
                  )}
                  
                  {myRole === 'spy' && (
                    <div className="bg-white/10 p-4 rounded-lg mt-4">
                      <p className="text-red-300">
                        Вы не знаете предмет! Попытайтесь понять, о чем говорят другие игроки, и не выдайте себя.
                      </p>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => setRoleRevealed(false)}
                  className="w-full mt-4 bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <EyeOff className="w-4 h-4" />
                  Скрыть роль
                </button>
              </div>
            )}
          </div>

          {/* Текущий ход */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Текущий ход</h2>
            
            <div className={`p-6 rounded-xl ${
              isMyTurn ? 'bg-yellow-500/20 border-2 border-yellow-500' : 'bg-white/5'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${isMyTurn ? 'text-yellow-400' : 'text-white'}`}>
                      {currentPlayer?.name}
                    </p>
                    <p className="text-purple-300 text-sm">
                      {isMyTurn ? 'Ваш ход - объясните предмет' : 'Сейчас объясняет'}
                    </p>
                  </div>
                </div>
                
                {isMyTurn && (
                  <button
                    onClick={nextTurn}
                    className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg flex items-center gap-2"
                  >
                    Завершить ход
                    <ArrowRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Список игроков */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Игроки</h2>
            
            <div className="space-y-2">
              {gameData.turnOrder.map((playerId, index) => {
                const player = roomData.players.find(p => p.id === playerId);
                const isCurrent = playerId === gameData.currentTurnPlayer;
                const hasTurnPassed = index < gameData.currentTurnIndex || 
                  (gameData.round > 1 && index <= gameData.currentTurnIndex);
                
                return (
                  <div
                    key={playerId}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      isCurrent 
                        ? 'bg-yellow-500/20 border border-yellow-500/50' 
                        : hasTurnPassed
                        ? 'bg-green-500/10 border border-green-500/30'
                        : 'bg-white/5'
                    }`}
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-white font-medium flex-1">{player?.name}</span>
                    {isCurrent && (
                      <span className="text-yellow-400 text-sm font-medium">Сейчас ход</span>
                    )}
                    {hasTurnPassed && !isCurrent && (
                      <span className="text-green-400 text-sm">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="fixed bottom-4 right-4 w-80 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 shadow-2xl overflow-hidden">
          {/* Заголовок чата */}
          <div className="bg-white/10 px-4 py-3 border-b border-white/20">
            <h3 className="text-white font-bold flex items-center gap-2">
              💬 Чат
            </h3>
          </div>
          
          {/* Сообщения */}
          <div className="h-64 overflow-y-auto p-3 space-y-2 bg-black/20">
            {chatMessages.length === 0 ? (
              <p className="text-purple-300 text-sm text-center py-8">
                Сообщений пока нет
              </p>
            ) : (
              chatMessages.map((msg) => {
                const isMyMessage = msg.playerId === currentPlayerId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 ${
                        isMyMessage
                          ? 'bg-blue-500/80 text-white'
                          : 'bg-white/10 text-white'
                      }`}
                    >
                      <p className="text-xs opacity-70 mb-1">{msg.playerName}</p>
                      <p className="text-sm break-words">{msg.message}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          {/* Поле ввода */}
          <div className="p-3 bg-white/5 border-t border-white/20">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Написать сообщение..."
                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-purple-300/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim()}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-all text-sm font-medium"
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Экран комнаты (лобби)
  if (screen === 'room' && roomData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Users className="w-8 h-8" />
                {roomData.roomName}
              </h1>
              <button
                onClick={leaveRoom}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
              >
                Выйти
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="bg-white/10 px-4 py-2 rounded-lg border border-white/20">
                <span className="text-purple-200 text-sm">ID комнаты: </span>
                <span className="text-white font-mono font-bold">{roomData.roomId}</span>
              </div>
              <button
                onClick={copyRoomId}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Скопировано!' : 'Копировать'}
              </button>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl mb-6">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Users className="w-6 h-6" />
              Участники ({roomData.players.length}/{roomData.maxPlayers})
            </h2>
            
            <div className="space-y-3">
              {roomData.players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-white font-medium text-lg">{player.name}</span>
                  </div>
                  
                  {player.isHost && (
                    <div className="flex items-center gap-2 bg-yellow-500/20 px-3 py-1 rounded-lg border border-yellow-500/30">
                      <Crown className="w-4 h-4 text-yellow-400" />
                      <span className="text-yellow-400 font-medium text-sm">Хост</span>
                    </div>
                  )}
                </div>
              ))}
              
              {Array.from({ length: roomData.maxPlayers - roomData.players.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 bg-white/5 rounded-xl p-4 border border-white/10 border-dashed opacity-50"
                >
                  <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-white/50" />
                  </div>
                  <span className="text-white/50 font-medium text-lg">Ожидание игрока...</span>
                </div>
              ))}
            </div>
          </div>

          {roomData.isHost && (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl">
              <button
                onClick={startGame}
                disabled={roomData.players.length < 3}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  roomData.players.length >= 3
                    ? 'bg-green-500 hover:bg-green-600 text-white transform hover:scale-105 shadow-lg'
                    : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                }`}
              >
                {roomData.players.length >= 3
                  ? 'Начать игру'
                  : `Ожидание игроков (минимум 3)`}
              </button>
              {roomData.players.length >= 3 && (
                <p className="text-center text-green-400 mt-3 text-sm">
                  Все готовы! Можно начинать игру
                </p>
              )}
            </div>
          )}

          {!roomData.isHost && (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl text-center">
              <p className="text-purple-200 text-lg">
                Ожидание начала игры... Хост запустит игру, когда все будут готовы.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-center">
              <p className="text-red-200">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

// Главный экран
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-3 flex items-center justify-center gap-3">
            <Users className="w-12 h-12" />
            Шпион: Isaac Edition
          </h1>
          <p className="text-purple-200 text-lg">Найди шпиона среди знатоков предметов!</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-center max-w-2xl mx-auto">
            <p className="text-red-200 font-medium">{error}</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 shadow-2xl hover:bg-white/15 transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-500 p-3 rounded-xl">
                <LogIn className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white">Присоединиться</h2>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-purple-200 mb-2 font-medium">
                  Ваше имя
                </label>
                <input
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Введите ваше имя"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
                  onKeyPress={(e) => e.key === 'Enter' && handleJoinRoom()}
                />
              </div>

              <div>
                <label className="block text-purple-200 mb-2 font-medium">
                  ID комнаты
                </label>
                <input
                  type="text"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                  placeholder="Например: ABC123"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all uppercase disabled:opacity-50"
                  onKeyPress={(e) => e.key === 'Enter' && handleJoinRoom()}
                />
              </div>

              <button
                onClick={handleJoinRoom}
                disabled={loading}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Подключение...
                  </>
                ) : (
                  'Войти в комнату'
                )}
              </button>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 shadow-2xl hover:bg-white/15 transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-green-500 p-3 rounded-xl">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white">Создать комнату</h2>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-purple-200 mb-2 font-medium">
                  Ваше имя
                </label>
                <input
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Введите ваше имя"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all disabled:opacity-50"
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
                />
              </div>

              <div>
                <label className="block text-purple-200 mb-2 font-medium">
                  Название комнаты
                </label>
                <input
                  type="text"
                  value={createRoomName}
                  onChange={(e) => setCreateRoomName(e.target.value)}
                  placeholder="Например: Вечерняя игра"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all disabled:opacity-50"
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
                />
              </div>

              <div>
                <label className="block text-purple-200 mb-2 font-medium">
                  Количество участников
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    value={playerCount}
                    onChange={(e) => setPlayerCount(Math.max(3, Math.min(20, parseInt(e.target.value) || 3)))}
                    min="3"
                    max="20"
                    disabled={loading}
                    className="w-24 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-center font-bold text-xl disabled:opacity-50"
                  />
                  <input
                    type="range"
                    value={playerCount}
                    onChange={(e) => setPlayerCount(parseInt(e.target.value))}
                    min="3"
                    max="20"
                    disabled={loading}
                    className="flex-1 accent-green-500 disabled:opacity-50"
                  />
                </div>
                <p className="text-purple-300 text-sm mt-2">От 3 до 20 игроков</p>
              </div>

              <button
                onClick={handleCreateRoom}
                disabled={loading}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Создание...
                  </>
                ) : (
                  'Создать комнату'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )};
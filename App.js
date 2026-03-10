import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BLOCK_SIZE = 15;
const COLS = 12;
const ROWS = 20;

const COLORS = [
  null,
  '#FF0D72',
  '#0DC2FF',
  '#0DFF72',
  '#F538FF',
  '#FF8E0D',
  '#FFE138',
  '#3877FF',
];

const SHAPES = [
  [],
  [[0,1,0], [1,1,1], [0,0,0]],
  [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
  [[1,1], [1,1]],
  [[0,0,1], [1,1,1], [0,0,0]],
  [[1,0,0], [1,1,1], [0,0,0]],
  [[1,1,0], [0,1,1], [0,0,0]],
  [[0,1,1], [1,1,0], [0,0,0]],
];

export default function App() {
  const [board, setBoard] = useState(
    Array.from({ length: ROWS }, () => Array(COLS).fill(0))
  );
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [piece, setPiece] = useState({
    pos: { x: 0, y: 0 },
    shape: null,
    color: 0,
  });
  const [nextPiece, setNextPiece] = useState({
    shape: null,
    color: 0,
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [highScores, setHighScores] = useState([]);
  const [musicEnabled, setMusicEnabled] = useState(true);

  const dropIntervalRef = useRef(null);
  const soundRef = useRef(null);
  const boardRef = useRef(board);
  const pieceRef = useRef(piece);
  const nextPieceRef = useRef(nextPiece);
  const gameStateRef = useRef({ gameStarted, gameOver, isPaused });

  // Синхронизируем refs с state
  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    pieceRef.current = piece;
  }, [piece]);

  useEffect(() => {
    nextPieceRef.current = nextPiece;
  }, [nextPiece]);

  useEffect(() => {
    gameStateRef.current = { gameStarted, gameOver, isPaused };
  }, [gameStarted, gameOver, isPaused]);

  useEffect(() => {
    loadHighScores();
    loadMusic();
    
    return () => {
      if (dropIntervalRef.current) {
        clearInterval(dropIntervalRef.current);
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const loadMusic = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('./assets/tetris-theme.mp3'),
        { isLooping: true, volume: 0.5 }
      );
      soundRef.current = sound;
    } catch (error) {
      console.log('Music loading error:', error);
    }
  };

  const toggleMusic = async () => {
    if (!soundRef.current) return;

    try {
      if (musicEnabled) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
      setMusicEnabled(!musicEnabled);
    } catch (error) {
      console.log('Music toggle error:', error);
    }
  };

  const createPiece = () => {
    const type = Math.floor(Math.random() * (SHAPES.length - 1)) + 1;
    return {
      shape: SHAPES[type],
      color: type,
    };
  };

  const loadHighScores = async () => {
    try {
      const scores = await AsyncStorage.getItem('tetrisHighScores');
      if (scores) {
        setHighScores(JSON.parse(scores));
      }
    } catch (error) {
      console.log('Error loading scores:', error);
    }
  };

  const saveHighScores = async (newScores) => {
    try {
      await AsyncStorage.setItem('tetrisHighScores', JSON.stringify(newScores));
      setHighScores(newScores);
    } catch (error) {
      console.log('Error saving scores:', error);
    }
  };

  const collide = (testPiece, testBoard) => {
    if (!testPiece.shape) return false;
    
    for (let y = 0; y < testPiece.shape.length; y++) {
      for (let x = 0; x < testPiece.shape[y].length; x++) {
        if (testPiece.shape[y][x] !== 0) {
          const newX = testPiece.pos.x + x;
          const newY = testPiece.pos.y + y;

          if (newX < 0 || newX >= COLS || newY >= ROWS) {
            return true;
          }
          if (newY >= 0 && testBoard[newY][newX] !== 0) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const merge = (currentPiece, currentBoard) => {
    const newBoard = currentBoard.map(row => [...row]);
    if (!currentPiece.shape) return newBoard;
    
    currentPiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          const boardY = currentPiece.pos.y + y;
          const boardX = currentPiece.pos.x + x;
          if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
            newBoard[boardY][boardX] = currentPiece.color;
          }
        }
      });
    });
    return newBoard;
  };

  const clearLines = (currentBoard) => {
    let linesCleared = 0;
    const newBoard = [...currentBoard];

    for (let y = ROWS - 1; y >= 0; y--) {
      if (newBoard[y].every((value) => value !== 0)) {
        newBoard.splice(y, 1);
        newBoard.unshift(Array(COLS).fill(0));
        linesCleared++;
        y++;
      }
    }

    return { newBoard, linesCleared };
  };

  const rotate = () => {
    if (!piece.shape || isPaused || !gameStarted || gameOver) return;

    const rotated = piece.shape[0].map((_, i) =>
      piece.shape.map((row) => row[i]).reverse()
    );

    const testPiece = { ...piece, shape: rotated };

    // Проверяем разные позиции при повороте (wall kick)
    const offsets = [0, 1, -1, 2, -2];
    
    for (let offset of offsets) {
      const adjustedPiece = {
        ...testPiece,
        pos: { ...testPiece.pos, x: testPiece.pos.x + offset }
      };
      
      if (!collide(adjustedPiece, board)) {
        setPiece(adjustedPiece);
        return;
      }
    }
  };

  const move = (dir) => {
    if (isPaused || !gameStarted || gameOver) return;

    const testPiece = {
      ...piece,
      pos: { ...piece.pos, x: piece.pos.x + dir },
    };

    if (!collide(testPiece, board)) {
      setPiece(testPiece);
    }
  };

  const drop = () => {
    const state = gameStateRef.current;
    if (!state.gameStarted || state.gameOver || state.isPaused) return;

    const currentPiece = pieceRef.current;
    const currentBoard = boardRef.current;

    const testPiece = {
      ...currentPiece,
      pos: { ...currentPiece.pos, y: currentPiece.pos.y + 1 },
    };

    if (!collide(testPiece, currentBoard)) {
      setPiece(testPiece);
    } else {
      const mergedBoard = merge(currentPiece, currentBoard);
      const { newBoard, linesCleared } = clearLines(mergedBoard);
      
      setBoard(newBoard);
      
      if (linesCleared > 0) {
        setLines(prev => {
          const newLines = prev + linesCleared;
          const newLevel = Math.floor(newLines / 10) + 1;
          
          if (newLevel > level) {
            setLevel(newLevel);
            startDropInterval(newLevel);
          }
          
          return newLines;
        });
        
        setScore(prev => prev + linesCleared * 100 * level);
      }
      
      resetPiece(newBoard);
    }
  };

  const resetPiece = (currentBoard) => {
    // Используем ref вместо state для получения актуального nextPiece
    const currentNext = nextPieceRef.current;
    const newPiece = currentNext.shape ? { ...currentNext } : createPiece();
    
    const startPiece = {
      shape: newPiece.shape,
      color: newPiece.color,
      pos: {
        x: Math.floor(COLS / 2) - Math.floor(newPiece.shape[0].length / 2),
        y: 0,
      },
    };

    if (collide(startPiece, currentBoard)) {
      setGameOver(true);
      setGameStarted(false);
      if (dropIntervalRef.current) {
        clearInterval(dropIntervalRef.current);
        dropIntervalRef.current = null;
      }
      if (soundRef.current && musicEnabled) {
        soundRef.current.pauseAsync();
      }
      setModalVisible(true);
    } else {
      const newNext = createPiece();
      setNextPiece(newNext);
      setPiece(startPiece);
    }
  };

  const startDropInterval = (currentLevel = level) => {
    if (dropIntervalRef.current) {
      clearInterval(dropIntervalRef.current);
      dropIntervalRef.current = null;
    }
    
    const speed = Math.max(200, 1000 - (currentLevel - 1) * 100);
    dropIntervalRef.current = setInterval(() => {
      drop();
    }, speed);
  };

  const startGame = async () => {
    const newBoard = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    setBoard(newBoard);
    setScore(0);
    setLines(0);
    setLevel(1);
    setGameOver(false);
    setIsPaused(false);
    setGameStarted(true);

    const firstPiece = createPiece();
    const firstNext = createPiece();

    setPiece({
      shape: firstPiece.shape,
      color: firstPiece.color,
      pos: {
        x: Math.floor(COLS / 2) - Math.floor(firstPiece.shape[0].length / 2),
        y: 0,
      },
    });
    setNextPiece(firstNext);

    if (soundRef.current && musicEnabled) {
      try {
        await soundRef.current.playAsync();
      } catch (error) {
        console.log('Music play error:', error);
      }
    }

    setTimeout(() => {
      startDropInterval(1);
    }, 100);
  };

  const togglePause = () => {
    if (!gameStarted || gameOver) return;

    if (isPaused) {
      startDropInterval();
    } else {
      if (dropIntervalRef.current) {
        clearInterval(dropIntervalRef.current);
        dropIntervalRef.current = null;
      }
    }
    setIsPaused(!isPaused);
  };

  const handleSaveScore = async () => {
    const name = playerName.trim() || 'Player';
    const newScore = {
      name,
      score,
      date: new Date().toLocaleDateString(),
    };

    const updatedScores = [...highScores, newScore]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    await saveHighScores(updatedScores);
    setModalVisible(false);
    setPlayerName('');
  };

  const renderBoard = () => {
    const displayBoard = board.map((row) => [...row]);

    if (piece.shape && !gameOver) {
      piece.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            const boardY = piece.pos.y + y;
            const boardX = piece.pos.x + x;
            if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
              displayBoard[boardY][boardX] = piece.color;
            }
          }
        });
      });
    }

    return displayBoard.map((row, y) => (
      <View key={y} style={styles.row}>
        {row.map((cell, x) => (
          <View
            key={x}
            style={[
              styles.cell,
              {
                backgroundColor: cell ? COLORS[cell] : '#000',
                borderColor: cell ? '#000' : '#333',
              },
            ]}
          />
        ))}
      </View>
    ));
  };

  const renderNextPiece = () => {
    if (!nextPiece.shape) return null;

    // Найти реальные границы фигуры (без пустых строк/столбцов)
    let minY = nextPiece.shape.length;
    let maxY = 0;
    let minX = nextPiece.shape[0].length;
    let maxX = 0;

    nextPiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      });
    });

    const actualHeight = maxY - minY + 1;
    const actualWidth = maxX - minX + 1;
    
    // Размер сетки для отображения
    const gridSize = 4;
    const grid = Array.from({ length: gridSize }, () =>
      Array(gridSize).fill(0)
    );

    // Центрируем только реальную часть фигуры
    const offsetY = Math.floor((gridSize - actualHeight) / 2);
    const offsetX = Math.floor((gridSize - actualWidth) / 2);

    nextPiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          const gridY = offsetY + (y - minY);
          const gridX = offsetX + (x - minX);
          
          if (gridY >= 0 && gridY < gridSize && gridX >= 0 && gridX < gridSize) {
            grid[gridY][gridX] = nextPiece.color;
          }
        }
      });
    });

    return grid.map((row, y) => (
      <View key={y} style={styles.nextRow}>
        {row.map((cell, x) => (
          <View
            key={x}
            style={[
              styles.nextCell,
              {
                backgroundColor: cell ? COLORS[cell] : '#000',
                borderColor: cell ? '#000' : '#333',
              },
            ]}
          />
        ))}
      </View>
    ));
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Text style={styles.title}>🎮 TETRIS</Text>

      <View style={styles.scoreBox}>
        <Text style={styles.scoreLabel}>Score: {score}</Text>
        <Text style={styles.scoreLabel}>Lines: {lines}</Text>
        <Text style={styles.scoreLabel}>Level: {level}</Text>
      </View>

      <View style={styles.nextBox}>
        <Text style={styles.nextTitle}>Next:</Text>
        <View style={styles.nextPieceContainer}>{renderNextPiece()}</View>
      </View>

      <View style={styles.boardContainer}>{renderBoard()}</View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={startGame}>
          <Text style={styles.buttonText}>
            {gameStarted && !gameOver ? '🔄 RESTART' : '▶️ START'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.pauseButton]}
          onPress={togglePause}
        >
          <Text style={styles.buttonText}>
            {isPaused ? '▶️ RESUME' : '⏸️ PAUSE'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.musicButton]}
          onPress={toggleMusic}
        >
          <Text style={styles.buttonText}>
            {musicEnabled ? '🔊' : '🔇'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <TouchableOpacity style={styles.controlButton} onPress={rotate}>
            <Text style={styles.controlText}>↻</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.controlRow}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => move(-1)}
          >
            <Text style={styles.controlText}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={drop}>
            <Text style={styles.controlText}>↓</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => move(1)}
          >
            <Text style={styles.controlText}>→</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.scoresContainer}>
        <Text style={styles.topTitle}>🏆 TOP-10</Text>
        <ScrollView style={styles.scoresScroll}>
          {highScores.map((entry, index) => (
            <Text key={index} style={styles.scoreEntry}>
              {index + 1}. {entry.name}: {entry.score}
            </Text>
          ))}
        </ScrollView>
      </View>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🎮 Game Over!</Text>
            <Text style={styles.modalScore}>Your Score: {score}</Text>

            {highScores.length < 10 ||
            score > (highScores[highScores.length - 1]?.score || 0) ? (
              <>
                <Text style={styles.recordMessage}>🎉 You made TOP-10!</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your name"
                  placeholderTextColor="#999"
                  value={playerName}
                  onChangeText={setPlayerName}
                  maxLength={20}
                />
              </>
            ) : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveScore}
              >
                <Text style={styles.modalButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.closeButton]}
                onPress={() => {
                  setModalVisible(false);
                  setPlayerName('');
                }}
              >
                <Text style={styles.modalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#667eea',
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  scoreBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 15,
  },
  scoreLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  nextBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  nextTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  nextPieceContainer: {
    alignItems: 'center',
  },
  nextRow: {
    flexDirection: 'row',
  },
  nextCell: {
    width: 12,
    height: 12,
    borderWidth: 1,
  },
  boardContainer: {
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 5,
    backgroundColor: '#000',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    width: BLOCK_SIZE,
    height: BLOCK_SIZE,
    borderWidth: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#4CAF50',
    padding: 10,
    borderRadius: 8,
    minWidth: 80,
  },
  pauseButton: {
    backgroundColor: '#2196F3',
  },
  musicButton: {
    backgroundColor: '#9C27B0',
    minWidth: 50,
  },
  buttonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  controls: {
    marginBottom: 10,
    gap: 5,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  scoresContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 10,
    borderRadius: 8,
    width: '90%',
    maxHeight: 150,
  },
  topTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
  },
  scoresScroll: {
    maxHeight: 120,
  },
  scoreEntry: {
    color: '#fff',
    fontSize: 12,
    marginVertical: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#667eea',
    padding: 30,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#fff',
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 15,
  },
  modalScore: {
    fontSize: 20,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 15,
  },
  recordMessage: {
    fontSize: 18,
    color: '#FFE138',
    textAlign: 'center',
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#fff',
    fontSize: 16,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  modalButton: {
    padding: 10,
    borderRadius: 5,
    minWidth: 100,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  closeButton: {
    backgroundColor: '#f44336',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

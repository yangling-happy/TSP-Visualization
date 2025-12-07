import TSPGeneticAlgorithm from "./TSPGeneticAlgorithm";
import "./index.css";

function App() {
  return (
    <div className="App">
      <h1 style={{ textAlign: "center" }}>TSP 旅行商遗传算法可视化</h1>
      <TSPGeneticAlgorithm />
    </div>
  );
}

export default App;

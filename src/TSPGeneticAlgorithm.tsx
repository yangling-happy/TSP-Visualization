import React, { useState, useEffect, useRef } from "react";
import * as d3 from "d3";
import "./TSPStyles.css";

// 城市类型定义
interface City {
  id: number;
  x: number;
  y: number;
}

// 遗传算法参数类型
interface GAConfig {
  cityCount: number;
  populationSize: number; // 种群大小
  mutationRate: number; // 变异率
  crossoverRate: number; // 交叉率
  generations: number; // 每轮迭代的进化代数
}

// 个体（一条路径）类型
interface Individual {
  path: City[];
  fitness: number; // 适应度（路径长度的倒数，越大越好）
  length: number; // 路径长度
}

const TSPGeneticAlgorithm: React.FC = () => {
  // 画布尺寸
  const canvasWidth = 800;
  const canvasHeight = 600;

  // 状态管理
  const [cities, setCities] = useState<City[]>([]);
  const [population, setPopulation] = useState<Individual[]>([]);
  const [bestIndividual, setBestIndividual] = useState<Individual>({
    path: [],
    fitness: 0,
    length: Infinity,
  });
  const [currentGen, setCurrentGen] = useState<number>(0); // 当前进化代数
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [config, setConfig] = useState<GAConfig>({
    cityCount: 20,
    populationSize: 50,
    mutationRate: 0.05,
    crossoverRate: 0.8,
    generations: 20,
  });

  // 渲染控制状态
  const [displayPaths, setDisplayPaths] = useState<{
    currentBest: City[];
    bestEver: City[];
    bestLength: number;
  }>({
    currentBest: [],
    bestEver: [],
    bestLength: Infinity,
  });

  // 算法运行控制Ref
  const animationRef = useRef<number | null>(null);
  const lastRenderTime = useRef<number>(0); // 上次渲染时间
  const generationsSinceLastRender = useRef<number>(0); // 上次渲染后的代数

  // 1. 生成随机城市
  const generateCities = (count: number): City[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * (canvasWidth - 40) + 20,
      y: Math.random() * (canvasHeight - 40) + 20,
    }));
  };

  // 2. 计算路径总长度
  const calculatePathLength = (path: City[]): number => {
    let length = 0;
    for (let i = 0; i < path.length; i++) {
      const curr = path[i];
      const next = path[(i + 1) % path.length]; // 闭环
      length += Math.hypot(next.x - curr.x, next.y - curr.y);
    }
    return length;
  };

  // 3. 计算个体适应度（路径越短，适应度越高）
  const calculateFitness = (individual: Individual): number => {
    return 1 / individual.length; // 倒数，避免除以0（路径长度最小为城市间距离和）
  };

  // 4. 初始化种群
  const initPopulation = (cities: City[], size: number): Individual[] => {
    const population: Individual[] = [];
    for (let i = 0; i < size; i++) {
      // 随机打乱城市顺序生成路径（保证每个城市只出现一次）
      const path = [...cities].sort(() => Math.random() - 0.5);
      const length = calculatePathLength(path);
      const fitness = calculateFitness({ path, fitness: 0, length });
      population.push({ path, fitness, length });
    }
    return population;
  };

  // 5. 选择：轮盘赌选择法（适应度越高，被选中概率越大）
  const select = (population: Individual[]): Individual => {
    // 计算总适应度
    const totalFitness = population.reduce((sum, ind) => sum + ind.fitness, 0);
    let randomNum = Math.random() * totalFitness;
    let cumulativeFitness = 0;

    for (const ind of population) {
      cumulativeFitness += ind.fitness;
      if (cumulativeFitness >= randomNum) {
        return ind;
      }
    }
    // 兜底返回第一个
    return population[0];
  };

  // 6. 交叉：顺序交叉（OX）—— 避免路径中城市重复
  const crossover = (parent1: Individual, parent2: Individual): City[] => {
    if (Math.random() > config.crossoverRate) {
      // 不交叉，直接返回父代1的路径
      return [...parent1.path];
    }

    const pathLength = parent1.path.length;
    // 随机选两个交叉点
    const start = Math.floor(Math.random() * pathLength);
    const end = Math.floor(Math.random() * pathLength);
    const [min, max] = start < end ? [start, end] : [end, start];

    // 1. 复制父代1的交叉段到子代
    const child: (City | null)[] = new Array(pathLength).fill(null);
    for (let i = min; i <= max; i++) {
      child[i] = parent1.path[i];
    }

    // 2. 从父代2填充剩余位置（跳过已存在的城市）
    let parent2Idx = 0;
    for (let i = 0; i < pathLength; i++) {
      if (child[i] !== null) continue;
      // 找到父代2中不在子代的城市
      while (
        child.some((c: City | null) => c?.id === parent2.path[parent2Idx].id)
      ) {
        parent2Idx++;
      }
      child[i] = parent2.path[parent2Idx];
      parent2Idx++;
    }

    return child.filter((city): city is City => city !== null);
  };

  // 7. 变异：交换变异（随机交换两个城市的位置）
  const mutate = (path: City[]): City[] => {
    const newPath = [...path];
    if (Math.random() > config.mutationRate) {
      return newPath; // 不变异
    }
    // 随机选两个位置交换
    const i = Math.floor(Math.random() * newPath.length);
    const j = Math.floor(Math.random() * newPath.length);
    [newPath[i], newPath[j]] = [newPath[j], newPath[i]];
    return newPath;
  };

  // 8. 遗传算法迭代步骤（一代进化）
  const gaIteration = () => {
    if (currentGen >= 1000) {
      // 最大进化代数，防止无限运行
      setIsRunning(false);
      return;
    }

    // 新一代种群
    const newPopulation: Individual[] = [];

    // 保留最优个体（精英策略）
    const elite = [...population].sort((a, b) => b.fitness - a.fitness)[0];
    newPopulation.push(elite);

    // 生成剩余个体
    while (newPopulation.length < config.populationSize) {
      // 选择父代
      const parent1 = select(population);
      const parent2 = select(population);
      // 交叉
      let childPath = crossover(parent1, parent2);
      // 变异
      childPath = mutate(childPath);
      // 计算子代的长度和适应度
      const childLength = calculatePathLength(childPath);
      const childFitness = calculateFitness({
        path: childPath,
        fitness: 0,
        length: childLength,
      });
      // 加入新种群
      newPopulation.push({
        path: childPath,
        fitness: childFitness,
        length: childLength,
      });
    }

    // 更新种群
    setPopulation(newPopulation);

    // 更新最优个体
    const currentBest = [...newPopulation].sort(
      (a, b) => a.length - b.length
    )[0];
    let newBestLength = bestIndividual.length;
    let newBestPath = bestIndividual.path;

    if (currentBest.length < bestIndividual.length) {
      setBestIndividual(currentBest);
      newBestLength = currentBest.length;
      newBestPath = currentBest.path;
    }

    // 检查是否应该渲染（每1秒渲染一次）
    const currentTime = Date.now();
    generationsSinceLastRender.current++;

    if (currentTime - lastRenderTime.current >= 1000) {
      // 更新显示路径
      setDisplayPaths({
        currentBest: currentBest.path,
        bestEver: newBestPath,
        bestLength: newBestLength,
      });

      // 重置计时器
      lastRenderTime.current = currentTime;
      generationsSinceLastRender.current = 0;
    }

    // 更新当前进化代数
    setCurrentGen((prev) => prev + 1);

    // 持续迭代
    if (isRunning) {
      animationRef.current = requestAnimationFrame(gaIteration);
    }
  };

  // 9. 控制算法开始/暂停
  const toggleRun = () => {
    if (isRunning) {
      // 暂停
      setIsRunning(false);
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }
    } else {
      // 开始
      setIsRunning(true);
      lastRenderTime.current = Date.now();
      generationsSinceLastRender.current = 0;

      // 使用 setInterval 实现每秒一次的迭代
      animationRef.current = window.setInterval(gaIteration, 1000);
    }
  };

  // 10. 重置所有状态
  const reset = () => {
    setIsRunning(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    const newCities = generateCities(config.cityCount);
    setCities(newCities);
    // 初始化种群
    const newPopulation = initPopulation(newCities, config.populationSize);
    setPopulation(newPopulation);
    // 初始化最优个体
    const initBest = [...newPopulation].sort((a, b) => a.length - b.length)[0];
    setBestIndividual(initBest);
    setDisplayPaths({
      currentBest: initBest.path,
      bestEver: initBest.path,
      bestLength: initBest.length,
    });
    setCurrentGen(0);
    lastRenderTime.current = Date.now(); // 重置为当前时间
    generationsSinceLastRender.current = 0;
  };

  // 初始化生成城市和种群
  useEffect(() => {
    reset();
    // 清理动画
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [config.cityCount, config.populationSize]);

  // 渲染画布（D3.js 绘制）
  useEffect(() => {
    const svg = d3
      .select("#tsp-canvas")
      .attr("width", canvasWidth)
      .attr("height", canvasHeight)
      .style("background", "#f8f9fa");

    // 清空画布
    svg.selectAll("*").remove();

    // 绘制当前种群最优路径（灰色）
    if (displayPaths.currentBest.length > 0) {
      svg
        .append("path")
        .attr(
          "d",
          d3
            .line<City>()
            .x((d) => d.x)
            .y((d) => d.y)
            .curve(d3.curveLinearClosed)(displayPaths.currentBest)
        )
        .attr("fill", "none")
        .attr("stroke", "#ccc")
        .attr("stroke-width", 1);
    }

    // 绘制全局最优路径（红色）
    if (displayPaths.bestEver.length > 0) {
      svg
        .append("path")
        .attr(
          "d",
          d3
            .line<City>()
            .x((d) => d.x)
            .y((d) => d.y)
            .curve(d3.curveLinearClosed)(displayPaths.bestEver)
        )
        .attr("fill", "none")
        .attr("stroke", "#ff4444")
        .attr("stroke-width", 2);
    }

    // 绘制城市（蓝色圆点）
    svg
      .selectAll(".city")
      .data(cities)
      .enter()
      .append("circle")
      .attr("class", "city")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", 4)
      .attr("fill", "#2196f3");
  }, [cities, displayPaths]);

  // 渲染UI
  return (
    <div className="tsp-container">
      <div className="tsp-controls">
        <div className="control-group">
          <label>城市数量：</label>
          <input
            type="number"
            value={config.cityCount}
            onChange={(e) =>
              setConfig({ ...config, cityCount: Number(e.target.value) })
            }
            min="5"
            max="50"
            disabled={isRunning}
          />
        </div>
        <div className="control-group">
          <label>种群大小：</label>
          <input
            type="number"
            value={config.populationSize}
            onChange={(e) =>
              setConfig({ ...config, populationSize: Number(e.target.value) })
            }
            min="10"
            max="200"
            disabled={isRunning}
          />
        </div>
        <div className="control-group">
          <label>变异率：</label>
          <input
            type="number"
            value={config.mutationRate}
            onChange={(e) =>
              setConfig({ ...config, mutationRate: Number(e.target.value) })
            }
            step="0.01"
            min="0.01"
            max="0.2"
            disabled={isRunning}
          />
        </div>
        <div className="control-group">
          <label>交叉率：</label>
          <input
            type="number"
            value={config.crossoverRate}
            onChange={(e) =>
              setConfig({ ...config, crossoverRate: Number(e.target.value) })
            }
            step="0.01"
            min="0.5"
            max="0.99"
            disabled={isRunning}
          />
        </div>
        <button onClick={toggleRun} className="btn">
          {isRunning ? "暂停" : "开始"}
        </button>
        <button onClick={reset} className="btn reset-btn" disabled={isRunning}>
          重置
        </button>
      </div>
      <div className="tsp-stats">
        <p>当前进化代数：{currentGen}</p>
        <p>
          当前种群最优长度：
          {population.length > 0
            ? population
                .sort((a, b) => a.length - b.length)[0]
                .length.toFixed(2)
            : 0}
        </p>
        <p>全局最优长度：{bestIndividual.length.toFixed(2)}</p>
      </div>
      <svg id="tsp-canvas" className="tsp-canvas"></svg>
    </div>
  );
};

export default TSPGeneticAlgorithm;

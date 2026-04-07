import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "./assets/vite.svg";
import heroImg from "./assets/hero.png";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      
      {/* ===== HERO SECTION ===== */}
      <section id="center" className="text-center space-y-6">
        <div className="hero flex items-center justify-center gap-4">
          <img src={heroImg} className="base w-40 h-auto" alt="Hero" />
          <img src={reactLogo} className="framework w-12" alt="React logo" />
          <img src={viteLogo} className="vite w-12" alt="Vite logo" />
        </div>

        <div>
          <h1 className="text-4xl font-bold text-green-400">
            Factory Twin UI Ready 🚀
          </h1>
          <p className="text-gray-400 mt-2">
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>

        <button
          className="counter bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg text-white transition"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
      </section>

      {/* ===== DIVIDER ===== */}
      <div className="ticks my-10"></div>

      {/* ===== NEXT STEPS ===== */}
      <section
        id="next-steps"
        className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl"
      >
        {/* Docs */}
        <div id="docs" className="bg-gray-900 p-6 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold mb-2">Documentation</h2>
          <p className="text-gray-400 mb-4">Your questions, answered</p>
          <ul className="space-y-2">
            <li>
              <a
                href="https://vite.dev/"
                target="_blank"
                className="flex items-center gap-2 text-blue-400 hover:underline"
              >
                <img className="w-5" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a
                href="https://react.dev/"
                target="_blank"
                className="flex items-center gap-2 text-blue-400 hover:underline"
              >
                <img className="w-5" src={reactLogo} alt="" />
                Learn React
              </a>
            </li>
          </ul>
        </div>

        {/* Social */}
        <div id="social" className="bg-gray-900 p-6 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold mb-2">Connect</h2>
          <p className="text-gray-400 mb-4">Join the Vite community</p>
          <ul className="space-y-2">
            <li>
              <a
                href="https://github.com/vitejs/vite"
                target="_blank"
                className="text-blue-400 hover:underline"
              >
                GitHub
              </a>
            </li>
            <li>
              <a
                href="https://chat.vite.dev/"
                target="_blank"
                className="text-blue-400 hover:underline"
              >
                Discord
              </a>
            </li>
            <li>
              <a
                href="https://x.com/vite_js"
                target="_blank"
                className="text-blue-400 hover:underline"
              >
                X.com
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks my-10"></div>

      <section id="spacer"></section>
    </div>
  );
}

export default App;
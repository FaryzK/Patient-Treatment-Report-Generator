import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="mx-auto max-w-4xl px-4">
        <h1 className="mb-8 text-center text-4xl font-bold text-gray-900">
          Patient Treatment Report Generator
        </h1>
        <div className="rounded-lg bg-white p-6 shadow-lg">
          <button 
            onClick={() => setCount((count) => count + 1)}
            className="rounded-md bg-blue-500 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-600"
          >
            Count is {count}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App

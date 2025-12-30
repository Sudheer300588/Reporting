import React from 'react';
import { NavLink } from 'react-router-dom';

const Navbar = () => (
  <nav className="bg-white border-b border-gray-200/60 px-4 py-3 flex items-center space-x-6">
    <NavLink to="/" className={({ isActive }) => isActive ? 'text-blue-600 font-semibold text-lg' : 'text-gray-700 hover:text-blue-600 text-lg'}>
      DropCowboy
    </NavLink>
  {/* Link removed */}
  </nav>
);

export default Navbar;

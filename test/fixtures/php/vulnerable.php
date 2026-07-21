<?php
// Intentionally broken PHP fixture for ghas-free-pack acceptance tests.
declare(strict_types=1);

function add(int $a, int $b): int
{
    return $a + $b;
}

// Wrong argument types
echo add('not', 'numbers');

// Undefined variable
echo $neverDefined;

// Call to an undefined function
totallyUnknownFunction(42);
